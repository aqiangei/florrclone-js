/**
 * Online multiplayer client resource archive — download only.
 * Target: https://152.32.173.78/
 * No analysis / decompile / path fuzzing.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const OUT = path.resolve(__dirname, 'online-game-archive');
const PROFILE = path.resolve(__dirname, 'online-game-profile');
const LOG = [];

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  LOG.push(line);
  console.log(line);
}

const DIRS = [
  'html', 'js', 'css', 'wasm', 'workers', 'maps', 'configs', 'images', 'audio', 'video',
  'fonts', 'binary', 'packages', 'manifests', 'inline', 'blob', 'data-url',
  'cache-storage', 'indexeddb', 'local-storage', 'session-storage', 'opfs',
  'websocket', 'network', 'metadata', 'logs', 'reports',
];
for (const d of DIRS) fs.mkdirSync(path.join(OUT, d), { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const resources = new Map(); // key = url|sha or url
const networkEntries = [];
const wsSessions = [];
const downloadEvents = [];
const workerEvents = [];
const errors = [];
let seq = 0;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function redactUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/token|auth|key|session|password|secret|cookie|jwt|sid/i.test(k)) {
        url.searchParams.set(k, '[REDACTED]');
      }
    }
    return url.toString();
  } catch {
    return String(u).replace(/(token|auth|key|session|password|secret)=([^&]+)/gi, '$1=[REDACTED]');
  }
}

function classify(url, contentType, resourceType) {
  const u = (url || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (u.startsWith('blob:')) return 'blob';
  if (u.startsWith('data:')) return 'data-url';
  if (resourceType === 'websocket') return 'websocket';
  if (u.includes('worker') || resourceType === 'worker' || resourceType === 'sharedworker') return 'workers';
  if (u.endsWith('.wasm') || ct.includes('wasm')) return 'wasm';
  if (u.endsWith('.css') || ct.includes('text/css') || resourceType === 'stylesheet') return 'css';
  if (u.endsWith('.js') || u.endsWith('.mjs') || ct.includes('javascript')) return 'js';
  if (u.includes('manifest') || u.endsWith('.webmanifest')) return 'manifests';
  if (u.endsWith('.json') || ct.includes('json')) {
    if (/map|world|biome|tile/i.test(u)) return 'maps';
    return 'configs';
  }
  if (u.endsWith('.html') || u.endsWith('.htm') || ct.includes('text/html') || resourceType === 'document') return 'html';
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)(\?|$)/i.test(u) || ct.startsWith('image/') || resourceType === 'image') return 'images';
  if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(u) || ct.startsWith('audio/') || resourceType === 'media') return 'audio';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u) || ct.startsWith('video/')) return 'video';
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) || ct.startsWith('font/') || resourceType === 'font') return 'fonts';
  if (/\.(zip|pak|bundle|bin|dat|pack)(\?|$)/i.test(u)) return 'packages';
  return 'binary';
}

function safeBase(urlStr, fallbackExt) {
  try {
    if (urlStr.startsWith('data:')) {
      const m = /^data:([^;,]+)/.exec(urlStr);
      const ext = mimeExt(m && m[1]) || fallbackExt || '.bin';
      return `data_${seq}${ext}`;
    }
    if (urlStr.startsWith('blob:')) return `blob_${seq}${fallbackExt || '.bin'}`;
    const u = new URL(urlStr);
    let base = path.basename(u.pathname) || 'index';
    base = decodeURIComponent(base).replace(/[<>:"|?*\x00-\x1f]/g, '_');
    if (!path.extname(base) && fallbackExt) base += fallbackExt;
    if (base.length > 140) {
      const ext = path.extname(base);
      base = base.slice(0, 100) + '_' + sha256(Buffer.from(urlStr)).slice(0, 8) + ext;
    }
    return base;
  } catch {
    return `res_${seq}${fallbackExt || '.bin'}`;
  }
}

function mimeExt(ct) {
  if (!ct) return '';
  const map = {
    'text/html': '.html',
    'text/css': '.css',
    'text/javascript': '.js',
    'application/javascript': '.js',
    'application/json': '.json',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'font/ttf': '.ttf',
    'application/wasm': '.wasm',
  };
  return map[ct.split(';')[0].trim()] || '';
}

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let i = 1;
  while (fs.existsSync(p)) {
    p = path.join(dir, `${stem}__${i}${ext}`);
    i++;
  }
  return p;
}

function redactHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (/authorization|cookie|set-cookie|token|api-key|x-auth|x-csrf/i.test(k)) out[k] = '[REDACTED]';
    else out[k] = v;
  }
  return out;
}

async function archiveBody(meta, body) {
  if (!body || !body.length) {
    meta.archived = false;
    meta.failReason = 'empty body';
    return meta;
  }
  const hash = sha256(body);
  meta.sha256 = hash;
  meta.size = body.length;

  // Dedup by content hash for same URL+hash
  const dedupeKey = `${meta.url}#${hash}`;
  if (resources.has(dedupeKey)) {
    meta.archived = true;
    meta.localPath = resources.get(dedupeKey).localPath;
    meta.deduped = true;
    resources.set(meta.id, meta);
    return meta;
  }

  const folder = classify(meta.url, meta.contentType, meta.resourceType);
  let ext = path.extname(safeBase(meta.url, '')) || mimeExt(meta.contentType) || '';
  if (folder === 'js' && !ext) ext = '.js';
  if (folder === 'wasm' && !ext) ext = '.wasm';
  const name = safeBase(meta.url, ext);
  const localPath = uniquePath(path.join(OUT, folder), name);
  fs.writeFileSync(localPath, body);
  meta.localPath = path.relative(OUT, localPath).replace(/\\/g, '/');
  meta.folder = folder;
  meta.archived = true;
  resources.set(dedupeKey, meta);
  resources.set(meta.id, meta);
  seq++;
  return meta;
}

function newMeta(partial) {
  const id = `r_${String(++seq).padStart(6, '0')}`;
  return {
    id,
    url: '',
    finalUrl: '',
    requestType: 'GET',
    httpStatus: 0,
    contentType: '',
    localPath: null,
    size: 0,
    sha256: null,
    fetchedAt: new Date().toISOString(),
    sourcePage: TARGET,
    archived: false,
    failReason: null,
    etag: null,
    lastModified: null,
    cacheControl: null,
    fromCache: false,
    initiator: null,
    resourceType: null,
    ...partial,
  };
}

async function saveResponse(response, pageUrl) {
  const req = response.request();
  const url = response.url();
  const headers = response.headers();
  const meta = newMeta({
    url: redactUrl(url),
    finalUrl: redactUrl(url),
    requestType: req.method(),
    httpStatus: response.status(),
    contentType: headers['content-type'] || '',
    etag: headers['etag'] || null,
    lastModified: headers['last-modified'] || null,
    cacheControl: headers['cache-control'] || null,
    fromCache: response.fromServiceWorker(),
    initiator: req.frame() ? 'frame' : null,
    resourceType: req.resourceType(),
    sourcePage: pageUrl || TARGET,
    headers: redactHeaders(headers),
  });

  networkEntries.push({
    time: meta.fetchedAt,
    method: meta.requestType,
    url: meta.url,
    status: meta.httpStatus,
    resourceType: meta.resourceType,
    contentType: meta.contentType,
    fromCache: meta.fromCache,
  });

  if (url.startsWith('data:')) {
    try {
      const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(url);
      if (m) {
        const isB64 = /;base64/i.test(url.slice(0, url.indexOf(',')));
        const body = isB64 ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]));
        meta.contentType = (m[1] || 'application/octet-stream').trim();
        await archiveBody(meta, body);
      } else {
        meta.archived = false;
        meta.failReason = 'unparsed data-url';
        resources.set(meta.id, meta);
      }
    } catch (e) {
      meta.archived = false;
      meta.failReason = e.message;
      resources.set(meta.id, meta);
    }
    return;
  }

  if (url.startsWith('blob:')) {
    meta.archived = false;
    meta.failReason = 'blob url — body captured via page evaluate if possible later';
    resources.set(meta.id, meta);
    return;
  }

  if (meta.httpStatus < 200 || meta.httpStatus >= 400) {
    meta.archived = false;
    meta.failReason = `HTTP ${meta.httpStatus}`;
    resources.set(meta.id, meta);
    return;
  }

  try {
    const body = await response.body();
    await archiveBody(meta, body);
  } catch (e) {
    meta.archived = false;
    meta.failReason = `body: ${e.message}`;
    resources.set(meta.id, meta);
  }
}

function attachWebSocket(page) {
  page.on('websocket', (ws) => {
    const session = {
      url: redactUrl(ws.url()),
      connectedAt: new Date().toISOString(),
      closedAt: null,
      handshakeOk: true,
      messages: [],
      frames: 0,
      bytesIn: 0,
      bytesOut: 0,
    };
    wsSessions.push(session);

    ws.on('framereceived', (event) => {
      const payload = event.payload;
      const isBuf = typeof payload !== 'string';
      const size = isBuf ? payload.length : Buffer.byteLength(payload);
      session.frames++;
      session.bytesIn += size;
      const entry = {
        dir: 'in',
        t: new Date().toISOString(),
        type: isBuf ? 'binary' : 'text',
        size,
        sha256: sha256(isBuf ? Buffer.from(payload) : Buffer.from(payload, 'utf8')),
        // Do not store raw payload (may contain player/session data)
        contentSaved: false,
        note: 'payload omitted for privacy; metadata only',
      };
      session.messages.push(entry);
    });

    ws.on('framesent', (event) => {
      const payload = event.payload;
      const isBuf = typeof payload !== 'string';
      const size = isBuf ? payload.length : Buffer.byteLength(payload);
      session.frames++;
      session.bytesOut += size;
      session.messages.push({
        dir: 'out',
        t: new Date().toISOString(),
        type: isBuf ? 'binary' : 'text',
        size,
        sha256: sha256(isBuf ? Buffer.from(payload) : Buffer.from(payload, 'utf8')),
        contentSaved: false,
        note: 'payload omitted for privacy; metadata only',
      });
    });

    ws.on('close', () => {
      session.closedAt = new Date().toISOString();
      session.handshakeOk = true;
    });
    ws.on('socketerror', (e) => {
      session.error = String(e);
    });
  });
}

async function dumpStorage(page) {
  return page.evaluate(async () => {
    const out = {
      localStorage: {},
      sessionStorage: {},
      indexedDB: [],
      caches: [],
      serviceWorkers: [],
      opfs: null,
    };
    const redactKey = (k) => /token|password|secret|auth|credential|session|cookie|jwt/i.test(k);

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out.localStorage[k] = redactKey(k) ? '[REDACTED]' : localStorage.getItem(k);
      }
    } catch (e) {
      out.localStorageError = String(e);
    }
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        out.sessionStorage[k] = redactKey(k) ? '[REDACTED]' : sessionStorage.getItem(k);
      }
    } catch (e) {
      out.sessionStorageError = String(e);
    }

    try {
      if (indexedDB.databases) {
        for (const dbInfo of await indexedDB.databases()) {
          const detail = { name: dbInfo.name, version: dbInfo.version, stores: [] };
          try {
            const db = await new Promise((resolve, reject) => {
              const req = indexedDB.open(dbInfo.name);
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            for (const storeName of Array.from(db.objectStoreNames)) {
              const store = { name: storeName, count: 0, sampleKeys: [] };
              const tx = db.transaction(storeName, 'readonly');
              const os = tx.objectStore(storeName);
              store.count = await new Promise((r) => {
                const q = os.count();
                q.onsuccess = () => r(q.result);
                q.onerror = () => r(-1);
              });
              store.sampleKeys = await new Promise((r) => {
                const q = os.getAllKeys();
                q.onsuccess = () => r((q.result || []).slice(0, 30).map(String));
                q.onerror = () => r([]);
              });
              detail.stores.push(store);
            }
            db.close();
          } catch (e) {
            detail.error = String(e);
          }
          out.indexedDB.push(detail);
        }
      }
    } catch (e) {
      out.indexedDBError = String(e);
    }

    try {
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        out.caches.push({
          name: key,
          entryCount: reqs.length,
          urls: reqs.slice(0, 500).map((r) => r.url),
        });
      }
    } catch (e) {
      out.cachesError = String(e);
    }

    try {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        out.serviceWorkers = regs.map((r) => ({
          scope: r.scope,
          active: r.active && r.active.scriptURL,
          waiting: r.waiting && r.waiting.scriptURL,
          installing: r.installing && r.installing.scriptURL,
        }));
      }
    } catch (e) {
      out.serviceWorkersError = String(e);
    }

    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const names = [];
        // for-await may not work everywhere; try keys
        if (root.keys) {
          for await (const name of root.keys()) names.push(name);
        }
        out.opfs = { entries: names.slice(0, 200) };
      } else {
        out.opfs = { available: false };
      }
    } catch (e) {
      out.opfs = { error: String(e) };
    }

    return out;
  });
}

async function exportCaches(page, storage) {
  let n = 0;
  for (const c of storage.caches || []) {
    for (const url of c.urls || []) {
      try {
        const result = await page.evaluate(async ({ cacheName, url }) => {
          const cache = await caches.open(cacheName);
          const res = await cache.match(url);
          if (!res) return null;
          const buf = await res.arrayBuffer();
          return {
            status: res.status,
            contentType: res.headers.get('content-type') || '',
            body: Array.from(new Uint8Array(buf)),
          };
        }, { cacheName: c.name, url });
        if (!result || result.status >= 400) continue;
        const body = Buffer.from(result.body);
        const meta = newMeta({
          url: redactUrl(url),
          finalUrl: redactUrl(url),
          httpStatus: result.status,
          contentType: result.contentType,
          resourceType: 'cache-storage',
          methodNote: 'cache-storage',
        });
        const localPath = uniquePath(
          path.join(OUT, 'cache-storage'),
          safeBase(url, mimeExt(result.contentType) || '.bin')
        );
        fs.writeFileSync(localPath, body);
        meta.localPath = path.relative(OUT, localPath).replace(/\\/g, '/');
        meta.size = body.length;
        meta.sha256 = sha256(body);
        meta.archived = true;
        meta.folder = 'cache-storage';
        resources.set(meta.id, meta);
        n++;
      } catch (e) {
        errors.push({ stage: 'cache-export', url, error: e.message });
      }
    }
  }
  return n;
}

async function tryOnlineMultiplayer(page) {
  const steps = [];
  const ui = await page.evaluate(() => {
    const texts = [];
    document.querySelectorAll('button, a, [role=button], input').forEach((el) => {
      texts.push({
        tag: el.tagName,
        text: (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.placeholder || '').trim().slice(0, 80),
        type: el.getAttribute('type') || '',
        disabled: !!el.disabled,
        className: String(el.className || '').slice(0, 60),
      });
    });
    return {
      title: document.title,
      body: (document.body.innerText || '').slice(0, 2500),
      controls: texts.slice(0, 80),
    };
  });
  steps.push({ scan: ui });

  // Open Account / Profile
  for (const label of [/account/i, /profile/i, /login/i, /sign\s*in/i, /注册/, /登录/, /多人/, /online/i, /multiplayer/i, /server/i]) {
    try {
      const loc = page.getByText(label).first();
      if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
        await loc.click({ timeout: 2000 }).catch(() => {});
        steps.push({ clicked: String(label) });
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      steps.push({ clickFail: String(label), error: e.message });
    }
  }

  // Try lobby account button by aria
  try {
    const acc = page.getByRole('button', { name: /account|profile/i }).first();
    if (await acc.count()) {
      await acc.click({ timeout: 2000 });
      steps.push({ clickedRole: 'account' });
      await page.waitForTimeout(2000);
    }
  } catch {}

  // Capture dialog state
  const afterAccount = await page.evaluate(() => (document.body.innerText || '').slice(0, 3000));
  steps.push({ afterAccount: afterAccount.slice(0, 1500) });

  // If login form exists without credentials, we cannot authenticate — document and continue guest/online-available UI
  const hasLogin = /password|email|login|sign in|register|注册|密码/i.test(afterAccount);
  steps.push({ loginFormVisible: hasLogin });

  // Play as guest / Ready — may still hit lobby; try play anyway
  try {
    const ready = page.getByRole('button', { name: /ready|play|start/i }).first();
    if (await ready.count()) {
      const disabled = await ready.isDisabled().catch(() => false);
      steps.push({ readyDisabled: disabled });
      if (!disabled) {
        await ready.click({ timeout: 3000 });
        steps.push({ clickedReady: true });
        await page.waitForTimeout(3000);
      }
    }
  } catch {}

  // Biome clicks + map exploration (normal play; triggers lazy assets)
  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    try {
      const btn = page.getByRole('button', { name: map, exact: true }).first();
      if ((await btn.count()) && (await btn.isVisible().catch(() => false))) {
        await btn.click({ timeout: 1500 });
        steps.push({ biome: map });
        await page.waitForTimeout(2500);
      }
    } catch {}
  }

  // Gameplay inputs
  await page.mouse.move(640, 360);
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(400 + Math.sin(i / 3) * 200, 300 + Math.cos(i / 4) * 150);
    await page.waitForTimeout(50);
  }
  await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  await page.keyboard.up('Space');
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyM', 'Escape', 'Digit1', 'KeyR']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(200);
  }

  // Open shop / settings / gallery if labeled
  for (const t of [/shop/i, /settings/i, /gallery/i, /guild/i, /achievement/i, /inventory/i, /craft/i, /talent/i, /chat/i]) {
    try {
      const b = page.getByRole('button', { name: t }).first();
      if ((await b.count()) && (await b.isVisible().catch(() => false))) {
        await b.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(800);
        await page.keyboard.press('Escape').catch(() => {});
        steps.push({ opened: String(t) });
      }
    } catch {}
  }

  // Mobile viewport pass
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2000);
  steps.push({ mobileViewport: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1000);

  return steps;
}

function writeHar() {
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'capture-online-archive', version: '1.0' },
      pages: [{ startedDateTime: new Date().toISOString(), id: 'page_1', title: TARGET }],
      entries: networkEntries.map((e) => ({
        startedDateTime: e.time,
        request: { method: e.method, url: e.url, headers: [] },
        response: {
          status: e.status,
          content: { mimeType: e.contentType || '', size: -1 },
          headers: [],
        },
        comment: e.fromCache ? 'fromServiceWorker/cache' : '',
      })),
    },
  };
  fs.writeFileSync(path.join(OUT, 'network', 'session.har'), JSON.stringify(har, null, 2));
  fs.writeFileSync(path.join(OUT, 'network', 'network-log.json'), JSON.stringify(networkEntries, null, 2));
}

function listArchived() {
  return [...resources.values()].filter((r) => r.id && r.id.startsWith('r_'));
}

function writeMetadata() {
  const list = listArchived();
  const byUrl = {};
  for (const r of list) {
    if (!r.url) continue;
    byUrl[r.url] = byUrl[r.url] || [];
    byUrl[r.url].push({
      id: r.id,
      localPath: r.localPath,
      sha256: r.sha256,
      size: r.size,
      archived: r.archived,
    });
  }
  fs.writeFileSync(path.join(OUT, 'metadata', 'resources.json'), JSON.stringify(list, null, 2));
  fs.writeFileSync(path.join(OUT, 'metadata', 'url-map.json'), JSON.stringify(byUrl, null, 2));

  const checksumLines = list
    .filter((r) => r.archived && r.sha256 && r.localPath)
    .map((r) => `${r.sha256}  ${r.localPath}`);
  fs.writeFileSync(path.join(OUT, 'metadata', 'checksums.sha256'), checksumLines.join('\n') + '\n');
}

function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchOnce(new URL(res.headers.location, url).href).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function retryFailedPublic() {
  const list = listArchived();
  const failed = list.filter(
    (r) =>
      !r.archived &&
      r.url &&
      r.url.startsWith('http') &&
      !/websocket/i.test(r.resourceType || '') &&
      r.httpStatus !== 401 &&
      r.httpStatus !== 403
  );
  const retried = [];
  // Only retry observed URLs, max once each, polite delay
  for (const r of failed.slice(0, 80)) {
    try {
      await new Promise((res) => setTimeout(res, 120));
      const res = await fetchOnce(r.url.replace('[REDACTED]', 'x')); // shouldn't have redacted host paths
      if (res.status === 200 && res.body.length) {
        const meta = newMeta({
          url: r.url,
          finalUrl: r.url,
          httpStatus: res.status,
          contentType: res.headers['content-type'] || r.contentType,
          resourceType: r.resourceType,
          retryOf: r.id,
        });
        await archiveBody(meta, res.body);
        retried.push({ from: r.id, to: meta.id, ok: meta.archived });
      } else {
        retried.push({ from: r.id, status: res.status });
      }
    } catch (e) {
      retried.push({ from: r.id, error: e.message });
    }
  }
  return retried;
}

function verifyChecksums() {
  const lines = fs.readFileSync(path.join(OUT, 'metadata', 'checksums.sha256'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
  let ok = 0;
  let bad = 0;
  const badList = [];
  for (const line of lines) {
    const m = /^([a-f0-9]{64})\s+(.+)$/i.exec(line);
    if (!m) continue;
    const file = path.join(OUT, m[2]);
    if (!fs.existsSync(file)) {
      bad++;
      badList.push({ path: m[2], reason: 'missing' });
      continue;
    }
    const h = sha256(fs.readFileSync(file));
    if (h === m[1].toLowerCase()) ok++;
    else {
      bad++;
      badList.push({ path: m[2], reason: 'hash mismatch' });
    }
  }
  return { ok, bad, badList };
}

async function zipArchive() {
  const zipPath = path.resolve(__dirname, 'online-game-archive.zip');
  // Use PowerShell Compress-Archive via child — but call from node
  const { execFileSync } = require('child_process');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: 'inherit' }
  );
  // verify unzip list
  const listing = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Add-Type -AssemblyName System.IO.Compression.FileSystem); [IO.Compression.ZipFile]::OpenRead('${zipPath}').Entries.Count`,
    ],
    { encoding: 'utf8' }
  ).trim();
  return { zipPath, entryCount: Number(listing) || listing };
}

(async () => {
  log('Launching Chromium with isolated profile…');
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    args: ['--ignore-certificate-errors'],
  });

  // CDP network enable before navigation
  const page = context.pages()[0] || (await context.newPage());
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: false });

  client.on('Network.requestWillBeSent', (params) => {
    // initiator info enrichment later via network log
  });
  client.on('Network.responseReceived', () => {});

  page.on('response', (response) => {
    saveResponse(response, page.url()).catch((e) => errors.push({ stage: 'saveResponse', error: e.message, url: response.url() }));
  });
  page.on('download', (d) => {
    downloadEvents.push({ url: redactUrl(d.url()), suggestedFilename: d.suggestedFilename(), t: new Date().toISOString() });
  });
  page.on('worker', (w) => {
    workerEvents.push({ url: redactUrl(w.url()), t: new Date().toISOString() });
  });
  page.on('pageerror', (e) => errors.push({ stage: 'pageerror', error: String(e) }));
  attachWebSocket(page);

  const run = {
    target: TARGET,
    startedAt: new Date().toISOString(),
    modes: [],
    steps: [],
  };

  try {
    log('Navigating', TARGET);
    const resp = await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(() =>
      page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 })
    );
    run.steps.push({ goto: resp && resp.status() });
    await page.waitForTimeout(4000);
    try {
      await page.getByText(/Ready/i).waitFor({ timeout: 30000 });
      run.steps.push({ ready: true });
    } catch {
      run.steps.push({ ready: false });
    }

    // Save HTML snapshot
    const html = await page.content();
    fs.writeFileSync(path.join(OUT, 'html', 'document.html'), html);
    const inlineScripts = await page.evaluate(() =>
      [...document.querySelectorAll('script:not([src])')].map((s, i) => ({ i, text: s.textContent || '' }))
    );
    for (const s of inlineScripts) {
      if (!s.text.trim()) continue;
      const p = path.join(OUT, 'inline', `inline-script-${s.i}.js`);
      fs.writeFileSync(p, s.text);
      const body = Buffer.from(s.text);
      const meta = newMeta({
        url: `inline:script:${s.i}`,
        httpStatus: 200,
        contentType: 'text/javascript',
        resourceType: 'inline-script',
        localPath: path.relative(OUT, p).replace(/\\/g, '/'),
        size: body.length,
        sha256: sha256(body),
        archived: true,
        folder: 'inline',
      });
      resources.set(meta.id, meta);
    }
    const inlineStyles = await page.evaluate(() =>
      [...document.querySelectorAll('style')].map((s, i) => ({ i, text: s.textContent || '' }))
    );
    for (const s of inlineStyles) {
      if (!s.text.trim()) continue;
      const p = path.join(OUT, 'inline', `inline-style-${s.i}.css`);
      fs.writeFileSync(p, s.text);
      const body = Buffer.from(s.text);
      const meta = newMeta({
        url: `inline:style:${s.i}`,
        httpStatus: 200,
        contentType: 'text/css',
        resourceType: 'inline-style',
        localPath: path.relative(OUT, p).replace(/\\/g, '/'),
        size: body.length,
        sha256: sha256(body),
        archived: true,
        folder: 'inline',
      });
      resources.set(meta.id, meta);
    }

    log('Attempting online multiplayer via normal UI…');
    const onlineSteps = await tryOnlineMultiplayer(page);
    run.steps.push({ online: onlineSteps });

    // Detect mode from UI text
    const modeText = await page.evaluate(() => (document.body.innerText || '').slice(0, 2000));
    const onlineHints = /online|multiplayer|server|lobby|match|ping|players online/i.test(modeText);
    const guestHints = /guest|offline|saved in this browser/i.test(modeText);
    run.modes.push({
      observed: onlineHints ? 'online-ui-hints-present' : guestHints ? 'guest-or-local-ui' : 'unknown',
      onlineHints,
      guestHints,
      note: onlineHints
        ? 'UI mentions online-related terms'
        : 'No clear separate multiplayer server lobby found without account credentials; guest/local play exercised',
    });

    // Wait for more lazy loads
    await page.waitForTimeout(5000);

    // Mild reconnect: reload once
    log('Normal reload (reconnect experience)…');
    await page.reload({ waitUntil: 'networkidle', timeout: 90000 }).catch(() => page.reload({ waitUntil: 'domcontentloaded' }));
    await page.waitForTimeout(4000);
    try {
      await page.getByText(/Ready/i).waitFor({ timeout: 20000 });
    } catch {}
    // Re-enter play briefly
    for (const map of ['Garden', 'Desert']) {
      try {
        const btn = page.getByRole('button', { name: map, exact: true }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 1500 });
          await page.waitForTimeout(2000);
        }
      } catch {}
    }
    await page.waitForTimeout(3000);

    log('Dumping browser storage…');
    const storage = await dumpStorage(page);
    fs.writeFileSync(path.join(OUT, 'local-storage', 'localStorage.json'), JSON.stringify(storage.localStorage, null, 2));
    fs.writeFileSync(path.join(OUT, 'session-storage', 'sessionStorage.json'), JSON.stringify(storage.sessionStorage, null, 2));
    fs.writeFileSync(path.join(OUT, 'indexeddb', 'indexeddb-meta.json'), JSON.stringify(storage.indexedDB, null, 2));
    fs.writeFileSync(path.join(OUT, 'opfs', 'opfs-meta.json'), JSON.stringify(storage.opfs, null, 2));
    fs.writeFileSync(path.join(OUT, 'cache-storage', 'caches-index.json'), JSON.stringify(storage.caches, null, 2));
    fs.writeFileSync(path.join(OUT, 'workers', 'service-workers.json'), JSON.stringify(storage.serviceWorkers, null, 2));
    const cacheN = await exportCaches(page, storage);
    run.steps.push({ cacheExported: cacheN });

    await page.screenshot({ path: path.join(OUT, 'reports', 'screenshot.png'), fullPage: true });

    // Let pending saves finish
    await page.waitForTimeout(2000);

    run.finishedBrowseAt = new Date().toISOString();
    run.workerEvents = workerEvents;
    run.downloadEvents = downloadEvents;
    run.errors = errors.slice(0, 100);
  } catch (e) {
    run.fatal = String(e);
    run.stack = e.stack;
    log('Fatal', e.message);
  } finally {
    await context.close().catch(() => {});
  }

  log('Retrying failed public static resources (limited)…');
  const retried = await retryFailedPublic();
  run.retries = retried;

  writeHar();
  writeMetadata();

  fs.writeFileSync(
    path.join(OUT, 'websocket', 'session-metadata.json'),
    JSON.stringify(
      {
        note: 'Payloads omitted; metadata and hashes only',
        sessions: wsSessions.map((s) => ({
          url: s.url,
          connectedAt: s.connectedAt,
          closedAt: s.closedAt,
          frames: s.frames,
          bytesIn: s.bytesIn,
          bytesOut: s.bytesOut,
          messageCount: s.messages.length,
          messages: s.messages,
          error: s.error || null,
        })),
      },
      null,
      2
    )
  );

  const list = listArchived();
  const archived = list.filter((r) => r.archived);
  const missing = list.filter((r) => !r.archived);
  const byFolder = {};
  for (const r of archived) {
    const f = r.folder || 'unknown';
    byFolder[f] = byFolder[f] || { count: 0, bytes: 0 };
    byFolder[f].count++;
    byFolder[f].bytes += r.size || 0;
  }
  const totalBytes = archived.reduce((a, b) => a + (b.size || 0), 0);

  const checksum = verifyChecksums();

  const summary = `# Download Summary

Target: ${TARGET}
Started: ${run.startedAt}
Browse finished: ${run.finishedBrowseAt || 'n/a'}

## Modes accessed

${(run.modes || []).map((m) => `- ${m.observed}: ${m.note}`).join('\n') || '- (see run-meta)'}

**Online multiplayer note:** No test account credentials were provided. Account/login UI was opened via normal controls when present. Guest/local play and lobby biomes were exercised. WebSocket sessions: **${wsSessions.length}**.

## Counts

| Metric | Value |
|--------|-------|
| Observed resource records | ${list.length} |
| Successfully archived | ${archived.length} |
| Failed / not archived | ${missing.length} |
| Total archived bytes | ${totalBytes} (${(totalBytes / 1048576).toFixed(2)} MiB) |
| JS | ${(byFolder.js && byFolder.js.count) || 0} |
| WASM | ${(byFolder.wasm && byFolder.wasm.count) || 0} |
| Workers | ${(byFolder.workers && byFolder.workers.count) || 0} |
| Images | ${(byFolder.images && byFolder.images.count) || 0} |
| Audio | ${(byFolder.audio && byFolder.audio.count) || 0} |
| Maps/configs | ${((byFolder.maps && byFolder.maps.count) || 0) + ((byFolder.configs && byFolder.configs.count) || 0)} |
| WebSocket sessions | ${wsSessions.length} |
| WS message metadata rows | ${wsSessions.reduce((a, s) => a + s.messages.length, 0)} |
| Checksums OK / bad | ${checksum.ok} / ${checksum.bad} |

## By folder

${Object.entries(byFolder)
  .map(([k, v]) => `- **${k}**: ${v.count} files, ${v.bytes} bytes`)
  .join('\n')}
`;

  const missingMd = `# Missing / Not Archived Resources

Observed but not successfully archived: **${missing.length}**

| ID | URL | Status | Reason |
|----|-----|--------|--------|
${missing
  .slice(0, 200)
  .map((r) => `| ${r.id} | ${String(r.url).replace(/\|/g, '\\|').slice(0, 120)} | ${r.httpStatus} | ${r.failReason || '-'} |`)
  .join('\n')}

## Untriggered / unavailable

- Authenticated-only online multiplayer assets: **not covered** (no credentials).
- Path-guessed assets: **not attempted** (policy).
- Other players' private data: **not collected**.
`;

  const coverageMd = `# Coverage Report

## In scope of this run

- First load of ${TARGET}
- Lobby UI, biome picker, Ready/guest play interactions
- Inventory/talents/crafting key presses and labeled UI buttons
- Mobile viewport toggle
- One normal page reload (reconnect)
- Account button open (no login)

## Observed coverage

- Network entries logged: ${networkEntries.length}
- Unique archived files: ${archived.length}
- Coverage vs observed successful HTTP responses: see resources.json \`archived\` flags

## Not claimed complete

Absolute completeness is not claimed. Only resources the browser actually requested or that appeared in Cache Storage during this session are in scope.
`;

  fs.writeFileSync(path.join(OUT, 'reports', 'download-summary.md'), summary);
  fs.writeFileSync(path.join(OUT, 'reports', 'missing-resources.md'), missingMd);
  fs.writeFileSync(path.join(OUT, 'reports', 'coverage.md'), coverageMd);
  fs.writeFileSync(path.join(OUT, 'reports', 'run-meta.json'), JSON.stringify(run, null, 2));
  fs.writeFileSync(path.join(OUT, 'logs', 'download.log'), LOG.join('\n') + '\n');

  log('Packaging ZIP…');
  let zipInfo;
  try {
    zipInfo = await zipArchive();
  } catch (e) {
    zipInfo = { error: e.message };
    log('ZIP failed', e.message);
  }

  const finalReport = {
    target: TARGET,
    archivedCount: archived.length,
    totalBytes,
    byFolder,
    js: (byFolder.js && byFolder.js.count) || 0,
    wasm: (byFolder.wasm && byFolder.wasm.count) || 0,
    workers: (byFolder.workers && byFolder.workers.count) || 0,
    images: (byFolder.images && byFolder.images.count) || 0,
    audio: (byFolder.audio && byFolder.audio.count) || 0,
    mapsConfigs: ((byFolder.maps && byFolder.maps.count) || 0) + ((byFolder.configs && byFolder.configs.count) || 0),
    wsSessions: wsSessions.length,
    wsMessages: wsSessions.reduce((a, s) => a + s.messages.length, 0),
    missing: missing.length,
    checksum,
    zip: zipInfo,
    modes: run.modes,
  };

  // Append zip path to summary
  fs.appendFileSync(
    path.join(OUT, 'reports', 'download-summary.md'),
    `\n## ZIP\n\n\`${(zipInfo && zipInfo.zipPath) || 'FAILED'}\`\nEntries: ${(zipInfo && zipInfo.entryCount) || 'n/a'}\n`
  );

  fs.writeFileSync(path.join(OUT, 'reports', 'final-stats.json'), JSON.stringify(finalReport, null, 2));
  console.log(JSON.stringify(finalReport, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
