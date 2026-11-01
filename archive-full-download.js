/**
 * Pure download / archive mode for https://152.32.173.78/
 * No source analysis — capture, save, verify, package only.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const ORIGIN = new URL(TARGET).origin;
const OUT = path.resolve(__dirname, 'web-game-archive');
const LOG = [];

const DIRS = [
  'pages', 'scripts', 'styles', 'wasm', 'workers', 'images', 'audio', 'video',
  'fonts', 'configs', 'binary', 'packages', 'cache-storage', 'indexeddb',
  'local-storage', 'session-storage', 'opfs', 'manifests', 'network',
  'inline-resources', 'blob-resources', 'data-resources', 'metadata', 'logs', 'reports',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  LOG.push(line);
  console.log(line);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ensureDirs() {
  for (const d of DIRS) fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { rejectUnauthorized: false, timeout: 90000, headers: { 'User-Agent': 'archive-bot/1.0' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuf(new URL(res.headers.location, url).href).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function classifyFolder(url, contentType, resourceType) {
  const u = (url || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (u.startsWith('blob:')) return 'blob-resources';
  if (u.startsWith('data:')) return 'data-resources';
  if (u.includes('worker') || resourceType === 'worker' || resourceType === 'sharedworker') return 'workers';
  if (u.endsWith('.wasm') || ct.includes('wasm')) return 'wasm';
  if (/\.(mp3|ogg|wav|aac|flac)(\?|$)/i.test(u) || ct.startsWith('audio/')) return 'audio';
  if (/\.(mp4|webm)(\?|$)/i.test(u) || ct.startsWith('video/')) return 'video';
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) || ct.includes('font')) return 'fonts';
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|$)/i.test(u) || ct.startsWith('image/')) return 'images';
  if (/\.(css)(\?|$)/i.test(u) || ct.includes('text/css')) return 'styles';
  if (/\.(js|mjs|cjs)(\?|$)/i.test(u) || ct.includes('javascript')) return 'scripts';
  if (/\.(html?|htm)(\?|$)/i.test(u) || resourceType === 'document' || ct.includes('text/html')) return 'pages';
  if (/\.(json|jsonl|xml|ya?ml|csv|txt|webmanifest)(\?|$)/i.test(u) || ct.includes('json') || ct.includes('xml'))
    return 'configs';
  if (/\.(zip|gz|br|pak|bin|dat)(\?|$)/i.test(u)) return 'packages';
  return 'binary';
}

function safePathFromUrl(urlStr) {
  try {
    if (urlStr.startsWith('data:')) {
      const head = urlStr.slice(0, 40).replace(/[^a-z0-9]+/gi, '_');
      return `data_${sha256(Buffer.from(urlStr)).slice(0, 16)}_${head}`;
    }
    if (urlStr.startsWith('blob:')) {
      return `blob_${sha256(Buffer.from(urlStr)).slice(0, 20)}`;
    }
    const u = new URL(urlStr);
    let p = u.pathname.replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    p = p.replace(/[<>:"|?*\x00-\x1f]/g, '_');
    if (u.search) {
      const q = sha256(Buffer.from(u.search)).slice(0, 8);
      const ext = path.extname(p);
      const stem = p.slice(0, p.length - ext.length);
      p = `${stem}__q${q}${ext}`;
    }
    return p;
  } catch {
    return `unknown_${sha256(Buffer.from(urlStr)).slice(0, 16)}`;
  }
}

function uniqueWrite(folder, relName, body) {
  let dest = path.join(OUT, folder, relName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest);
    if (sha256(existing) === sha256(body)) return { path: dest, deduped: true };
    const ext = path.extname(relName);
    const stem = relName.slice(0, relName.length - ext.length);
    let i = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(OUT, folder, `${stem}__v${i}${ext}`);
      i++;
    }
  }
  fs.writeFileSync(dest, body);
  return { path: dest, deduped: false };
}

const resources = new Map(); // key = finalUrl + '#' + sha
const byUrl = new Map(); // url -> latest entry
const observed = [];
let requestSeq = 0;

function recordEntry(entry) {
  observed.push(entry);
  if (entry.sha256) {
    resources.set(entry.finalUrl + '#' + entry.sha256, entry);
  }
  byUrl.set(entry.finalUrl || entry.url, entry);
}

async function saveBody(meta, body) {
  if (!body || !body.length) {
    meta.saved = false;
    meta.failReason = 'empty body';
    recordEntry(meta);
    return meta;
  }
  const folder = classifyFolder(meta.finalUrl || meta.url, meta.contentType, meta.resourceType);
  const rel = safePathFromUrl(meta.finalUrl || meta.url);
  const hash = sha256(body);
  const written = uniqueWrite(folder, rel, body);
  meta.saved = true;
  meta.folder = folder;
  meta.localPath = path.relative(OUT, written.path).replace(/\\/g, '/');
  meta.size = body.length;
  meta.sha256 = hash;
  meta.dedupedContent = written.deduped;
  recordEntry(meta);
  return meta;
}

async function dumpBrowserState(page, tag) {
  const storage = await page.evaluate(async () => {
    const out = {
      localStorage: {},
      sessionStorage: {},
      indexedDB: [],
      caches: [],
      serviceWorkers: [],
      opfs: null,
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/token|password|secret|auth|credential|cookie/i.test(k)) {
          out.localStorage[k] = '[REDACTED]';
        } else {
          out.localStorage[k] = localStorage.getItem(k);
        }
      }
    } catch (e) {
      out.localStorageError = String(e);
    }
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (/token|password|secret|auth|credential/i.test(k)) out.sessionStorage[k] = '[REDACTED]';
        else out.sessionStorage[k] = sessionStorage.getItem(k);
      }
    } catch (e) {
      out.sessionStorageError = String(e);
    }
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const info of dbs) {
          const detail = { name: info.name, version: info.version, stores: [] };
          try {
            const db = await new Promise((res, rej) => {
              const r = indexedDB.open(info.name);
              r.onsuccess = () => res(r.result);
              r.onerror = () => rej(r.error);
            });
            for (const storeName of Array.from(db.objectStoreNames)) {
              const tx = db.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              const count = await new Promise((res) => {
                const r = store.count();
                r.onsuccess = () => res(r.result);
                r.onerror = () => res(-1);
              });
              const keys = await new Promise((res) => {
                const r = store.getAllKeys();
                r.onsuccess = () => res((r.result || []).slice(0, 50));
                r.onerror = () => res([]);
              });
              detail.stores.push({
                name: storeName,
                keyPath: store.keyPath,
                indexes: Array.from(store.indexNames),
                count,
                sampleKeys: keys.map((k) => (typeof k === 'object' ? JSON.stringify(k) : String(k))),
              });
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
      const keys = await caches.keys();
      for (const name of keys) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        out.caches.push({ name, urls: reqs.map((r) => r.url) });
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
        // @ts-ignore
        for await (const [name] of root.entries()) names.push(name);
        out.opfs = { entries: names };
      } else {
        out.opfs = { available: false };
      }
    } catch (e) {
      out.opfs = { error: String(e) };
    }
    return out;
  });

  fs.writeFileSync(path.join(OUT, 'local-storage', `${tag}.json`), JSON.stringify(storage.localStorage, null, 2));
  fs.writeFileSync(path.join(OUT, 'session-storage', `${tag}.json`), JSON.stringify(storage.sessionStorage, null, 2));
  fs.writeFileSync(path.join(OUT, 'indexeddb', `${tag}.json`), JSON.stringify(storage.indexedDB, null, 2));
  fs.writeFileSync(path.join(OUT, 'opfs', `${tag}.json`), JSON.stringify(storage.opfs, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'manifests', `service-workers-${tag}.json`),
    JSON.stringify(storage.serviceWorkers, null, 2)
  );

  // Export cache storage bodies
  let cacheSaved = 0;
  for (const c of storage.caches || []) {
    for (const url of c.urls || []) {
      try {
        const result = await page.evaluate(async ({ cacheName, url }) => {
          const cache = await caches.open(cacheName);
          const res = await cache.match(url);
          if (!res) return null;
          const buf = await res.arrayBuffer();
          const headers = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          return { status: res.status, contentType: res.headers.get('content-type') || '', headers, body: Array.from(new Uint8Array(buf)) };
        }, { cacheName: c.name, url });
        if (!result) continue;
        const body = Buffer.from(result.body);
        const meta = {
          request_id: `cache-${++requestSeq}`,
          url,
          finalUrl: url,
          resourceType: 'cache',
          status: result.status,
          contentType: result.contentType,
          fromCache: true,
          method: 'cache-storage',
          downloadedAt: new Date().toISOString(),
          captureTag: tag,
        };
        await saveBody(meta, body);
        // also mirror under cache-storage/
        const rel = safePathFromUrl(url);
        uniqueWrite('cache-storage', path.join(c.name.replace(/[<>:"|?*]/g, '_'), rel), body);
        cacheSaved++;
      } catch (e) {
        log(`cache export fail ${url}: ${e.message}`);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'cache-storage', `${tag}-index.json`), JSON.stringify(storage.caches, null, 2));
  return { storage, cacheSaved };
}

async function playOffline(page) {
  log('Entering offline/guest play via UI…');
  try {
    await page.getByText(/Ready/i).waitFor({ timeout: 45000 });
  } catch {
    log('Ready not seen — continuing anyway');
  }

  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    try {
      const btn = page.getByText(map, { exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(1500);
      }
    } catch {}
  }

  // Click Ready / Play if enabled
  try {
    const play = page.locator('.play-button').first();
    if (await play.isVisible().catch(() => false)) {
      const disabled = await play.isDisabled().catch(() => true);
      if (!disabled) await play.click({ timeout: 2000 });
    }
  } catch {}

  // Gameplay inputs
  await page.mouse.move(640, 360);
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(400 + Math.sin(i / 3) * 200, 300 + Math.cos(i / 4) * 150);
    if (i % 5 === 0) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(200);
      await page.keyboard.up('Space');
    }
    await page.waitForTimeout(50);
  }
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyC', 'KeyR', 'Digit1', 'KeyM', 'Escape']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(120);
  }
  // Open inventory etc via Z again and wait
  await page.keyboard.press('KeyZ').catch(() => {});
  await page.waitForTimeout(2000);
  await page.keyboard.press('KeyX').catch(() => {});
  await page.waitForTimeout(1000);
  await page.keyboard.press('KeyC').catch(() => {});
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape').catch(() => {});

  for (const map of ['Desert', 'Ocean', 'Jungle', 'Hel', 'Garden']) {
    try {
      const btn = page.getByRole('button', { name: map, exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 1500 });
        await page.waitForTimeout(2500);
      }
    } catch {}
  }
  await page.waitForTimeout(3000);
}

function collectPublicAssetUrls() {
  const urls = new Set();
  // From previous capture if present
  const prevMan = path.resolve(__dirname, 'florr-site-download', 'json', 'manifest.json');
  const archiveMan = path.join(OUT, 'configs', 'assets', 'manifest.json');
  for (const p of [prevMan, archiveMan]) {
    if (!fs.existsSync(p)) continue;
    try {
      const man = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const v of Object.values(man)) {
        if (v && v.src) urls.add(v.src.startsWith('http') ? v.src : ORIGIN + v.src);
      }
    } catch {}
  }
  // Scan already saved scripts/pages for asset paths
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) scanDir(full);
      else if (/\.(js|css|html|json|webmanifest)$/i.test(name) && st.size < 20_000_000) {
        const text = fs.readFileSync(full, 'utf8');
        const re = /(\/(?:assets|fonts|_next\/static)\/[A-Za-z0-9._\-/%]+\.[A-Za-z0-9]+)/g;
        let m;
        while ((m = re.exec(text))) {
          let p = m[1].replace(/["'`)\]},;]+$/, '');
          try {
            p = decodeURIComponent(p);
          } catch {}
          urls.add(ORIGIN + p);
        }
      }
    }
  }
  scanDir(path.join(OUT, 'scripts'));
  scanDir(path.join(OUT, 'pages'));
  scanDir(path.join(OUT, 'configs'));
  urls.add(ORIGIN + '/favicon.svg');
  urls.add(ORIGIN + '/manifest.webmanifest');
  urls.add(ORIGIN + '/assets/manifest.json');
  urls.add(ORIGIN + '/fonts/ubuntu-bold.ttf');
  return [...urls];
}

async function fillGapsFromList(urls) {
  log(`Gap-fill: ${urls.length} candidate public URLs`);
  let ok = 0,
    fail = 0,
    skip = 0;
  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const idx = i++;
      const url = urls[idx];
      // skip if already saved same url with body
      const existing = byUrl.get(url);
      if (existing && existing.saved && existing.size > 0) {
        skip++;
        continue;
      }
      try {
        const res = await fetchBuf(url);
        const meta = {
          request_id: `gap-${++requestSeq}`,
          url,
          finalUrl: url,
          resourceType: 'gap-fill',
          status: res.status,
          contentType: res.headers['content-type'] || '',
          fromCache: false,
          method: 'GET',
          downloadedAt: new Date().toISOString(),
          headers: redactHeaders(res.headers),
        };
        if (res.status !== 200) {
          meta.saved = false;
          meta.failReason = `HTTP ${res.status}`;
          recordEntry(meta);
          fail++;
          continue;
        }
        await saveBody(meta, res.body);
        ok++;
        if (ok % 40 === 0) log(`gap-fill downloaded ${ok}`);
      } catch (e) {
        recordEntry({
          request_id: `gap-${++requestSeq}`,
          url,
          finalUrl: url,
          saved: false,
          failReason: e.message,
          downloadedAt: new Date().toISOString(),
        });
        fail++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  log(`Gap-fill done ok=${ok} skip=${skip} fail=${fail}`);
  return { ok, skip, fail };
}

function redactHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (/authorization|cookie|set-cookie|token|api-key|x-auth/i.test(k)) out[k] = '[REDACTED]';
    else out[k] = v;
  }
  return out;
}

async function runBrowserSession(userDataDir, tag) {
  log(`Browser session: ${tag}`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    args: ['--ignore-certificate-errors'],
  });
  const page = context.pages()[0] || (await context.newPage());

  // CDP Network
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });

  const pending = new Map();

  cdp.on('Network.requestWillBeSent', (params) => {
    pending.set(params.requestId, {
      request_id: params.requestId,
      url: params.request.url,
      method: params.request.method,
      resourceType: params.type || 'Other',
      redirectedFrom: params.redirectResponse ? params.redirectResponse.url : null,
    });
  });

  cdp.on('Network.responseReceived', (params) => {
    const p = pending.get(params.requestId) || { request_id: params.requestId };
    p.finalUrl = params.response.url;
    p.status = params.response.status;
    p.contentType = (params.response.mimeType || params.response.headers['content-type'] || '');
    p.fromCache = !!params.response.fromDiskCache || !!params.response.fromPrefetchCache;
    p.headers = redactHeaders(params.response.headers);
    p.responseTime = new Date().toISOString();
    pending.set(params.requestId, p);
  });

  cdp.on('Network.loadingFinished', async (params) => {
    const p = pending.get(params.requestId);
    if (!p) return;
    const url = p.finalUrl || p.url || '';
    if (!url || url.startsWith('chrome-extension:')) return;
    try {
      if (url.startsWith('data:')) {
        const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(url);
        if (m) {
          const ct = m[1] || 'application/octet-stream';
          let body;
          if (/;base64/.test(url.slice(0, url.indexOf(',')))) body = Buffer.from(m[2], 'base64');
          else body = Buffer.from(decodeURIComponent(m[2]));
          await saveBody(
            {
              ...p,
              contentType: ct,
              method: p.method || 'GET',
              downloadedAt: new Date().toISOString(),
              captureTag: tag,
              via: 'data-url',
            },
            body
          );
        }
        return;
      }
      if (url.startsWith('blob:')) {
        recordEntry({
          ...p,
          saved: false,
          failReason: 'blob URL — captured later via page if accessible',
          downloadedAt: new Date().toISOString(),
          captureTag: tag,
        });
        return;
      }
      const result = await cdp.send('Network.getResponseBody', { requestId: params.requestId }).catch(() => null);
      if (!result) {
        recordEntry({
          ...p,
          saved: false,
          failReason: 'CDP body unavailable',
          downloadedAt: new Date().toISOString(),
          captureTag: tag,
        });
        return;
      }
      const body = Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8');
      await saveBody(
        {
          ...p,
          method: p.method || 'GET',
          downloadedAt: new Date().toISOString(),
          captureTag: tag,
          via: 'cdp',
        },
        body
      );
    } catch (e) {
      recordEntry({
        ...p,
        saved: false,
        failReason: e.message,
        downloadedAt: new Date().toISOString(),
        captureTag: tag,
      });
    }
  });

  // Also Playwright response as backup
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('chrome')) return;
      const existing = byUrl.get(url);
      if (existing && existing.saved) return;
      if (response.status() < 200 || response.status() >= 400) return;
      const body = await response.body().catch(() => null);
      if (!body) return;
      await saveBody(
        {
          request_id: `pw-${++requestSeq}`,
          url,
          finalUrl: url,
          status: response.status(),
          contentType: response.headers()['content-type'] || '',
          resourceType: response.request().resourceType(),
          method: response.request().method(),
          fromCache: false,
          headers: redactHeaders(response.headers()),
          downloadedAt: new Date().toISOString(),
          captureTag: tag,
          via: 'playwright-response',
        },
        body
      );
    } catch {}
  });

  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  await playOffline(page);
  const state1 = await dumpBrowserState(page, `${tag}-online`);

  // Offline network test
  log('Going browser offline…');
  await context.setOffline(true);
  await page.waitForTimeout(2000);
  await page.mouse.move(500, 400);
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.keyboard.up('Space');
  await page.waitForTimeout(2000);
  const state2 = await dumpBrowserState(page, `${tag}-offline`);
  await context.setOffline(false);

  // Reload with cache
  log('Reload with cache…');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => log('reload: ' + e.message));
  await page.waitForTimeout(5000);
  await playOffline(page);
  await dumpBrowserState(page, `${tag}-reload`);

  await page.screenshot({ path: path.join(OUT, 'reports', `screenshot-${tag}.png`), fullPage: true });
  await context.close();
  return { state1, state2 };
}

function writeReports() {
  const entries = observed;
  const saved = entries.filter((e) => e.saved);
  const failed = entries.filter((e) => e.saved === false);

  // Unique saved files by localPath
  const files = new Map();
  for (const e of saved) {
    if (!e.localPath) continue;
    files.set(e.localPath, e);
  }

  const resourcesJson = [...files.values()].map((e) => ({
    request_id: e.request_id,
    url: e.url,
    finalUrl: e.finalUrl,
    resourceType: e.resourceType,
    status: e.status,
    contentType: e.contentType,
    fromCache: e.fromCache,
    saved: e.saved,
    localPath: e.localPath,
    size: e.size,
    sha256: e.sha256,
    downloadedAt: e.downloadedAt,
    via: e.via,
    failReason: e.failReason || null,
  }));

  // Also include failures
  const allMeta = [
    ...resourcesJson,
    ...failed.map((e) => ({
      request_id: e.request_id,
      url: e.url,
      finalUrl: e.finalUrl,
      resourceType: e.resourceType,
      status: e.status,
      contentType: e.contentType,
      fromCache: e.fromCache,
      saved: false,
      localPath: null,
      size: 0,
      sha256: null,
      downloadedAt: e.downloadedAt,
      via: e.via,
      failReason: e.failReason || 'unknown',
    })),
  ];

  fs.writeFileSync(path.join(OUT, 'metadata', 'resources.json'), JSON.stringify(allMeta, null, 2));

  const urlMap = {};
  for (const e of files.values()) {
    urlMap[e.finalUrl || e.url] = e.localPath;
  }
  fs.writeFileSync(path.join(OUT, 'metadata', 'url-map.json'), JSON.stringify(urlMap, null, 2));

  const checksumLines = [];
  for (const e of files.values()) {
    checksumLines.push(`${e.sha256}  ${e.localPath}`);
  }
  fs.writeFileSync(path.join(OUT, 'metadata', 'checksums.sha256'), checksumLines.join('\n') + '\n');

  // Verify files
  let verifyOk = 0,
    verifyFail = 0;
  const verifyFails = [];
  for (const e of files.values()) {
    const fp = path.join(OUT, e.localPath);
    if (!fs.existsSync(fp)) {
      verifyFail++;
      verifyFails.push({ path: e.localPath, reason: 'missing' });
      continue;
    }
    const buf = fs.readFileSync(fp);
    if (buf.length !== e.size || sha256(buf) !== e.sha256) {
      verifyFail++;
      verifyFails.push({ path: e.localPath, reason: 'checksum mismatch' });
    } else verifyOk++;
  }

  const byFolder = {};
  for (const e of files.values()) {
    const f = e.folder || e.localPath.split('/')[0];
    byFolder[f] = byFolder[f] || { count: 0, bytes: 0 };
    byFolder[f].count++;
    byFolder[f].bytes += e.size || 0;
  }

  const totalBytes = [...files.values()].reduce((a, b) => a + (b.size || 0), 0);
  const jsCount = [...files.values()].filter((e) => (e.folder === 'scripts' || /\.m?js$/i.test(e.localPath))).length;
  const wasmCount = [...files.values()].filter((e) => e.folder === 'wasm' || /\.wasm$/i.test(e.localPath)).length;
  const workerCount = [...files.values()].filter((e) => e.folder === 'workers').length;

  const summary = `# Download Summary

Target: ${TARGET}
Finished: ${new Date().toISOString()}

## Totals

- Saved unique files: ${files.size}
- Total bytes: ${totalBytes}
- Observed network records: ${entries.length}
- Failed / unsaved observations: ${failed.length}
- Checksum verify OK: ${verifyOk}
- Checksum verify FAIL: ${verifyFail}

## By folder

${Object.entries(byFolder)
  .map(([k, v]) => `- ${k}: ${v.count} files, ${v.bytes} bytes`)
  .join('\n')}

## Key counts

- JS/scripts: ${jsCount}
- WASM: ${wasmCount}
- Workers: ${workerCount}
`;

  fs.writeFileSync(path.join(OUT, 'reports', 'download-summary.md'), summary);

  // Missing: unique URLs observed but not saved
  const urlStatus = new Map();
  for (const e of entries) {
    const u = e.finalUrl || e.url;
    if (!u) continue;
    const cur = urlStatus.get(u) || { saved: false, reasons: [] };
    if (e.saved) cur.saved = true;
    else if (e.failReason) cur.reasons.push(e.failReason);
    urlStatus.set(u, cur);
  }
  const missing = [...urlStatus.entries()]
    .filter(([, v]) => !v.saved)
    .map(([url, v]) => ({ url, reasons: [...new Set(v.reasons)] }));

  fs.writeFileSync(
    path.join(OUT, 'reports', 'missing-resources.md'),
    `# Missing / Unsaved Resources\n\nCount: ${missing.length}\n\n` +
      missing.map((m) => `- ${m.url}\n  - ${m.reasons.join('; ') || 'unknown'}`).join('\n') +
      `\n\n## Verify fails\n\n` +
      verifyFails.map((v) => `- ${v.path}: ${v.reason}`).join('\n')
  );

  const coverage = `# Coverage

## Sessions
- Fresh profile + guest/offline play + map switches + inventory/talent/craft keys
- Browser offline continued interaction
- Reload with cache

## Resource classes
${Object.entries(byFolder)
  .map(([k, v]) => `- ${k}: captured ${v.count}`)
  .join('\n')}

## Local browser data
- localStorage dumps: local-storage/
- sessionStorage dumps: session-storage/
- IndexedDB schema dumps: indexeddb/
- Cache Storage: cache-storage/
- OPFS probes: opfs/
- Service worker registrations: manifests/

## Gaps
- See missing-resources.md (${missing.length} unsaved URL observations)
- Blob URLs without extractable body recorded as unsaved
- No path fuzzing performed; only observed + publicly referenced URLs
`;
  fs.writeFileSync(path.join(OUT, 'reports', 'coverage.md'), coverage);

  // HAR
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'archive-full-download', version: '1.0' },
      entries: entries
        .filter((e) => e.url && !String(e.url).startsWith('data:'))
        .slice(0, 5000)
        .map((e) => ({
          startedDateTime: e.downloadedAt || e.responseTime || new Date().toISOString(),
          request: { method: e.method || 'GET', url: e.url, headers: [] },
          response: {
            status: e.status || 0,
            headers: Object.entries(e.headers || {}).map(([name, value]) => ({ name, value })),
            content: { size: e.size || 0, mimeType: e.contentType || '' },
          },
          comment: e.saved ? `saved:${e.localPath}` : e.failReason || '',
        })),
    },
  };
  fs.writeFileSync(path.join(OUT, 'network', 'session.har'), JSON.stringify(har, null, 2));

  fs.writeFileSync(path.join(OUT, 'logs', 'download.log'), LOG.join('\n') + '\n');

  fs.writeFileSync(
    path.join(OUT, 'metadata', 'stats.json'),
    JSON.stringify(
      {
        savedFiles: files.size,
        totalBytes,
        jsCount,
        wasmCount,
        workerCount,
        failedObservations: failed.length,
        missingUrls: missing.length,
        verifyOk,
        verifyFail,
        localStorageKeys: 'see local-storage/',
        cacheEntries: 'see cache-storage/',
      },
      null,
      2
    )
  );

  return {
    savedFiles: files.size,
    totalBytes,
    jsCount,
    wasmCount,
    workerCount,
    failed: missing.length,
    verifyOk,
    verifyFail,
  };
}

function makeZip() {
  const zipPath = path.resolve(__dirname, 'web-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  // Use PowerShell Compress-Archive
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
  // Verify unzip list
  const listing = execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${zipPath}').Entries.Count"`
  )
    .toString()
    .trim();
  log(`ZIP created: ${zipPath} entries=${listing}`);
  return { zipPath, entries: Number(listing) || 0 };
}

(async () => {
  ensureDirs();
  log(`Start archive of ${TARGET}`);

  const freshDir = path.resolve(__dirname, '.pw-profile-fresh');
  const cachedDir = path.resolve(__dirname, '.pw-profile-cached');
  fs.rmSync(freshDir, { recursive: true, force: true });
  // keep cachedDir if exists for second pass

  await runBrowserSession(freshDir, 'fresh');
  await runBrowserSession(cachedDir, 'cached');

  // Gap fill from manifests + scanned refs
  const candidates = collectPublicAssetUrls();
  // Also merge from prior florr-local-site if present (copy bytes without re-fetch when possible)
  const localSite = path.resolve(__dirname, 'florr-local-site');
  if (fs.existsSync(localSite)) {
    log('Importing existing florr-local-site files into archive…');
    function walk(dir, base) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full, base);
        else {
          const relUrlPath = '/' + path.relative(base, full).replace(/\\/g, '/');
          const url = ORIGIN + relUrlPath;
          const body = fs.readFileSync(full);
          const existing = byUrl.get(url);
          if (existing && existing.saved && existing.sha256 === sha256(body)) continue;
          // fire and forget sync save
          // eslint-disable-next-line no-new-func
        }
      }
    }
    // sync import
    const stack = [localSite];
    while (stack.length) {
      const dir = stack.pop();
      for (const name of fs.readdirSync(dir)) {
        if (name === '_build-map.json') continue;
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) stack.push(full);
        else {
          const relUrlPath = '/' + path.relative(localSite, full).replace(/\\/g, '/');
          const url = ORIGIN + relUrlPath;
          const body = fs.readFileSync(full);
          const ex = byUrl.get(url);
          if (ex && ex.saved && ex.size === body.length) continue;
          await saveBody(
            {
              request_id: `import-${++requestSeq}`,
              url,
              finalUrl: url,
              status: 200,
              contentType: '',
              resourceType: 'import-local-mirror',
              method: 'GET',
              fromCache: false,
              downloadedAt: new Date().toISOString(),
              via: 'local-site-import',
            },
            body
          );
        }
      }
    }
  }

  await fillGapsFromList(candidates);

  // Second gap pass after scripts landed
  const more = collectPublicAssetUrls();
  await fillGapsFromList(more);

  const stats = writeReports();
  const zip = makeZip();

  const localDataCount =
    fs.readdirSync(path.join(OUT, 'local-storage')).length +
    fs.readdirSync(path.join(OUT, 'session-storage')).length +
    fs.readdirSync(path.join(OUT, 'indexeddb')).length +
    fs.readdirSync(path.join(OUT, 'cache-storage')).length +
    fs.readdirSync(path.join(OUT, 'opfs')).length;

  const final = {
    savedFiles: stats.savedFiles,
    totalBytes: stats.totalBytes,
    jsCount: stats.jsCount,
    wasmCount: stats.wasmCount,
    workerCount: stats.workerCount,
    localDataFiles: localDataCount,
    failedOrMissing: stats.failed,
    zipPath: zip.zipPath,
    zipEntries: zip.entries,
  };
  fs.writeFileSync(path.join(OUT, 'reports', 'final-stats.json'), JSON.stringify(final, null, 2));
  log('DONE ' + JSON.stringify(final));
  console.log('\n=== FINAL ===\n' + JSON.stringify(final, null, 2));
})().catch((e) => {
  log('FATAL ' + e.stack);
  fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'logs', 'download.log'), LOG.join('\n') + '\n' + String(e.stack));
  process.exit(1);
});
