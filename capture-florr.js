/**
 * Capture publicly loaded client resources from viep.nex offline/singleplayer mode.
 * Only records responses the browser actually receives — no path fuzzing.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const OUT = path.resolve(__dirname, 'florr-site-download');
const DIRS = ['html', 'js', 'wasm', 'workers', 'json', 'assets', 'cache', 'network', 'reports'];

for (const d of DIRS) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

const resources = new Map(); // url -> meta
const networkLog = [];
const errors = [];
let seq = 0;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function classify(url, contentType, resourceType) {
  const u = url.toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (u.includes('worker') || resourceType === 'worker' || resourceType === 'sharedworker') return 'workers';
  if (u.endsWith('.wasm') || ct.includes('wasm')) return 'wasm';
  if (u.endsWith('.js') || u.endsWith('.mjs') || ct.includes('javascript')) return 'js';
  if (u.endsWith('.json') || ct.includes('json') || ct.includes('application/ld+json')) return 'json';
  if (u.endsWith('.html') || u.endsWith('.htm') || ct.includes('text/html') || resourceType === 'document') return 'html';
  if (u.endsWith('.css') || ct.includes('text/css')) return 'assets';
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|woff2?|ttf|otf|eot|mp3|ogg|wav|m4a|mp4|webm)(\?|$)/i.test(u)) return 'assets';
  if (ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('font/') || ct.startsWith('video/')) return 'assets';
  if (resourceType === 'stylesheet' || resourceType === 'image' || resourceType === 'font' || resourceType === 'media') return 'assets';
  return 'assets';
}

function safeName(urlStr, fallbackExt) {
  try {
    const u = new URL(urlStr);
    let base = path.basename(u.pathname) || 'index';
    base = base.replace(/[<>:"|?*\x00-\x1f]/g, '_');
    if (!path.extname(base) && fallbackExt) base += fallbackExt;
    if (base.length > 120) base = base.slice(0, 100) + path.extname(base);
    return base;
  } catch {
    return `resource_${seq}${fallbackExt || ''}`;
  }
}

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let i = 1;
  while (fs.existsSync(p)) {
    p = path.join(dir, `${stem}_${i}${ext}`);
    i++;
  }
  return p;
}

function guessPurpose(url, type, resourceType) {
  const u = url.toLowerCase();
  if (type === 'wasm') return 'WebAssembly game/runtime module';
  if (type === 'workers') return 'Web Worker / Service Worker script';
  if (type === 'html') return 'HTML document / shell';
  if (u.includes('sourcemap') || u.endsWith('.map')) return 'Source map';
  if (type === 'json') return 'JSON config / data';
  if (type === 'js') return 'JavaScript client logic';
  if (/\.(png|jpe?g|gif|webp|svg)/i.test(u)) return 'Image asset';
  if (/\.(mp3|ogg|wav)/i.test(u)) return 'Audio asset';
  if (/\.(woff2?|ttf|otf)/i.test(u)) return 'Font asset';
  if (u.endsWith('.css')) return 'Stylesheet';
  return `Network resource (${resourceType || 'other'})`;
}

async function saveResponse(response) {
  const url = response.url();
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
    networkLog.push({
      url,
      status: response.status(),
      resourceType: response.request().resourceType(),
      skipped: url.startsWith('data:') ? 'data-uri' : url.startsWith('blob:') ? 'blob-uri' : 'empty',
      time: new Date().toISOString(),
    });
    return;
  }

  const req = response.request();
  const resourceType = req.resourceType();
  const status = response.status();
  const headers = response.headers();
  const contentType = headers['content-type'] || '';
  const entry = {
    url,
    status,
    resourceType,
    contentType,
    headers: { ...headers },
    method: req.method(),
    time: new Date().toISOString(),
  };

  // Redact auth-ish headers from HAR-like log
  for (const k of Object.keys(entry.headers)) {
    if (/authorization|cookie|set-cookie|token|api-key|x-auth/i.test(k)) {
      entry.headers[k] = '[REDACTED]';
    }
  }

  if (status < 200 || status >= 400) {
    entry.saved = false;
    entry.reason = `HTTP ${status}`;
    networkLog.push(entry);
    return;
  }

  // Prefer body from browser response (already received)
  let body;
  try {
    body = await response.body();
  } catch (e) {
    entry.saved = false;
    entry.reason = `body unavailable: ${e.message}`;
    networkLog.push(entry);
    return;
  }

  if (resources.has(url)) {
    entry.saved = true;
    entry.deduped = true;
    entry.localPath = resources.get(url).localPath;
    networkLog.push(entry);
    return;
  }

  const folder = classify(url, contentType, resourceType);
  let ext = '';
  if (folder === 'wasm') ext = '.wasm';
  else if (folder === 'js' || folder === 'workers') ext = '.js';
  else if (folder === 'json') ext = '.json';
  else if (folder === 'html') ext = '.html';

  const name = safeName(url, ext);
  const localPath = uniquePath(path.join(OUT, folder), name);
  fs.writeFileSync(localPath, body);

  const meta = {
    url,
    localPath: path.relative(OUT, localPath).replace(/\\/g, '/'),
    size: body.length,
    sha256: sha256(body),
    contentType,
    downloadedAt: entry.time,
    purpose: guessPurpose(url, folder, resourceType),
    method: 'browser-response',
    licenseNote: 'Third-party client asset; local research only; do not redistribute unless licensed.',
    resourceType,
    status,
    folder,
  };
  resources.set(url, meta);
  entry.saved = true;
  entry.localPath = meta.localPath;
  entry.size = meta.size;
  entry.sha256 = meta.sha256;
  networkLog.push(entry);
  seq++;
}

async function dumpStorage(page) {
  return page.evaluate(async () => {
    const out = {
      localStorage: {},
      sessionStorage: {},
      indexedDB: [],
      caches: [],
      serviceWorkers: [],
      cookiesNote: 'cookies omitted from dump for privacy',
    };

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // Skip likely secrets
        if (/token|password|secret|auth|credential|session/i.test(k)) {
          out.localStorage[k] = '[REDACTED_SENSITIVE_KEY]';
        } else {
          const v = localStorage.getItem(k);
          out.localStorage[k] = v && v.length > 5000 ? v.slice(0, 5000) + '…[truncated]' : v;
        }
      }
    } catch (e) {
      out.localStorageError = String(e);
    }

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (/token|password|secret|auth|credential/i.test(k)) {
          out.sessionStorage[k] = '[REDACTED_SENSITIVE_KEY]';
        } else {
          const v = sessionStorage.getItem(k);
          out.sessionStorage[k] = v && v.length > 5000 ? v.slice(0, 5000) + '…[truncated]' : v;
        }
      }
    } catch (e) {
      out.sessionStorageError = String(e);
    }

    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          const name = dbInfo.name;
          const version = dbInfo.version;
          const detail = { name, version, stores: [] };
          try {
            const db = await new Promise((resolve, reject) => {
              const req = indexedDB.open(name);
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            detail.storeNames = Array.from(db.objectStoreNames);
            for (const storeName of detail.storeNames) {
              const storeMeta = { name: storeName, keyPath: null, indexes: [], sampleKeys: [] };
              try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                storeMeta.keyPath = store.keyPath;
                storeMeta.indexes = Array.from(store.indexNames);
                const keys = await new Promise((resolve) => {
                  const r = store.getAllKeys();
                  r.onsuccess = () => resolve(r.result.slice(0, 20));
                  r.onerror = () => resolve([]);
                });
                storeMeta.sampleKeys = keys.map((k) => (typeof k === 'object' ? JSON.stringify(k) : String(k)));
                // count only
                storeMeta.count = await new Promise((resolve) => {
                  const r = store.count();
                  r.onsuccess = () => resolve(r.result);
                  r.onerror = () => resolve(-1);
                });
              } catch (se) {
                storeMeta.error = String(se);
              }
              detail.stores.push(storeMeta);
            }
            db.close();
          } catch (de) {
            detail.error = String(de);
          }
          out.indexedDB.push(detail);
        }
      } else {
        out.indexedDBNote = 'indexedDB.databases() not available';
      }
    } catch (e) {
      out.indexedDBError = String(e);
    }

    try {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        const urls = [];
        for (const r of reqs.slice(0, 500)) {
          urls.push(r.url);
        }
        out.caches.push({ name: key, entryCount: reqs.length, urls });
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

    return out;
  });
}

async function findAndClickOffline(page) {
  const attempts = [];

  // Collect visible text / buttons
  const ui = await page.evaluate(() => {
    const texts = [];
    const walk = (el) => {
      if (!el) return;
      const tag = el.tagName || '';
      const t = (el.innerText || el.textContent || '').trim().slice(0, 80);
      if (t && /offline|single|local|单人|离线|guest|play|start|garden|desert|ocean|jungle|hel/i.test(t)) {
        texts.push({ tag, text: t, id: el.id || '', className: String(el.className || '').slice(0, 80) });
      }
      for (const c of el.children || []) walk(c);
    };
    walk(document.body);
    return {
      title: document.title,
      bodySnippet: (document.body && document.body.innerText || '').slice(0, 2000),
      candidates: texts.slice(0, 40),
    };
  });
  attempts.push({ step: 'ui-scan', ui });

  // Try common selectors / labels
  const labels = [
    /offline/i,
    /single\s*player/i,
    /singleplayer/i,
    /local/i,
    /离线/,
    /单人/,
    /guest/i,
    /play/i,
    /start/i,
  ];

  for (const re of labels) {
    try {
      const loc = page.getByText(re).first();
      if (await loc.count() > 0 && (await loc.isVisible().catch(() => false))) {
        await loc.click({ timeout: 3000 }).catch(() => {});
        attempts.push({ step: 'click-text', pattern: String(re), ok: true });
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      attempts.push({ step: 'click-text', pattern: String(re), error: e.message });
    }
  }

  // Click map buttons from search snippet: GardenDesertOceanJungleHelMap
  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    try {
      const btn = page.getByText(map, { exact: true }).first();
      if (await btn.count() > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.click({ timeout: 2000 });
        attempts.push({ step: 'click-map', map, ok: true });
        await page.waitForTimeout(2000);
        break;
      }
    } catch (e) {
      attempts.push({ step: 'click-map', map, error: e.message });
    }
  }

  // Keyboard / mouse gameplay to trigger loads
  await page.mouse.move(400, 300);
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(400 + Math.sin(i) * 120, 300 + Math.cos(i) * 80);
    await page.waitForTimeout(80);
  }
  // Hold space (petals)
  await page.keyboard.down('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('Space');
  // Movement WASD / arrows
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Digit1', 'Digit2', 'KeyR', 'KeyZ', 'KeyX', 'KeyC']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(200);
    await page.keyboard.up(key);
  }
  attempts.push({ step: 'gameplay-inputs', ok: true });

  return attempts;
}

async function exportCacheBodies(page, storage) {
  const saved = [];
  if (!storage.caches) return saved;
  for (const c of storage.caches) {
    for (const url of c.urls || []) {
      if (resources.has(url)) continue;
      try {
        const result = await page.evaluate(async ({ cacheName, url }) => {
          const cache = await caches.open(cacheName);
          const res = await cache.match(url);
          if (!res) return null;
          const buf = await res.arrayBuffer();
          const headers = {};
          res.headers.forEach((v, k) => { headers[k] = v; });
          return {
            status: res.status,
            contentType: res.headers.get('content-type') || '',
            headers,
            body: Array.from(new Uint8Array(buf)),
          };
        }, { cacheName: c.name, url });
        if (!result || !result.body) continue;
        const body = Buffer.from(result.body);
        const folder = classify(url, result.contentType, 'cache');
        const localPath = uniquePath(path.join(OUT, 'cache'), safeName(url, ''));
        fs.writeFileSync(localPath, body);
        const meta = {
          url,
          localPath: path.relative(OUT, localPath).replace(/\\/g, '/'),
          size: body.length,
          sha256: sha256(body),
          contentType: result.contentType,
          downloadedAt: new Date().toISOString(),
          purpose: 'Cache Storage entry',
          method: 'cache-storage',
          licenseNote: 'Third-party client asset; local research only.',
          folder: 'cache',
          cacheName: c.name,
        };
        resources.set(url + '#cache', meta);
        saved.push(meta);
      } catch (e) {
        errors.push({ url, error: e.message, stage: 'cache-export' });
      }
    }
  }
  return saved;
}

function writeHar() {
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'capture-florr', version: '1.0' },
      pages: [{ startedDateTime: new Date().toISOString(), id: 'page_1', title: TARGET }],
      entries: networkLog.map((e) => ({
        startedDateTime: e.time,
        request: {
          method: e.method || 'GET',
          url: e.url,
          headers: [],
        },
        response: {
          status: e.status || 0,
          content: {
            size: e.size || 0,
            mimeType: e.contentType || '',
            // body omitted intentionally (already on disk); keep HAR lightweight & redacted
          },
          headers: Object.entries(e.headers || {}).map(([name, value]) => ({ name, value })),
        },
        comment: e.saved ? `saved:${e.localPath}` : (e.reason || e.skipped || ''),
      })),
    },
  };
  fs.writeFileSync(path.join(OUT, 'network', 'network.har'), JSON.stringify(har, null, 2));
  fs.writeFileSync(path.join(OUT, 'network', 'network-log.json'), JSON.stringify(networkLog, null, 2));
}

function writeManifest() {
  const list = [...resources.values()];
  fs.writeFileSync(path.join(OUT, 'reports', 'manifest.json'), JSON.stringify(list, null, 2));
  const lines = [
    '# Downloaded Resources',
    '',
    `Target: ${TARGET}`,
    `Captured at: ${new Date().toISOString()}`,
    `Total files: ${list.length}`,
    `Total bytes: ${list.reduce((a, b) => a + b.size, 0)}`,
    '',
    '| URL | Local Path | Size | SHA-256 | Content-Type | Method | Purpose |',
    '|-----|------------|------|---------|--------------|--------|---------|',
  ];
  for (const r of list) {
    lines.push(
      `| ${r.url.replace(/\|/g, '\\|')} | ${r.localPath} | ${r.size} | \`${r.sha256.slice(0, 16)}…\` | ${r.contentType || '-'} | ${r.method} | ${r.purpose} |`
    );
  }
  lines.push('', '## License / use', '', 'Assets retained for local technical research only. Do not redistribute unless you have rights.');
  fs.writeFileSync(path.join(OUT, 'reports', 'resources.md'), lines.join('\n'));
}

(async () => {
  console.log('Launching Chromium…');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  page.on('response', (response) => {
    saveResponse(response).catch((e) => errors.push({ url: response.url(), error: e.message, stage: 'saveResponse' }));
  });
  page.on('pageerror', (err) => errors.push({ stage: 'pageerror', error: String(err) }));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push({ stage: 'console', error: msg.text() });
  });

  const runMeta = { target: TARGET, startedAt: new Date().toISOString(), steps: [] };

  try {
    console.log('Navigating to', TARGET);
    const resp = await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(async (e) => {
      runMeta.steps.push({ goto: 'networkidle failed', error: e.message });
      return page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
    });
    runMeta.steps.push({ gotoStatus: resp && resp.status() });
    await page.waitForTimeout(4000);

    // Wait for "Ready" text if present
    try {
      await page.getByText(/Ready/i).waitFor({ timeout: 30000 });
      runMeta.steps.push({ ready: true });
    } catch {
      runMeta.steps.push({ ready: false });
    }

    const offlineAttempts = await findAndClickOffline(page);
    runMeta.steps.push({ offlineAttempts });

    // Extra wait for assets after map load
    await page.waitForTimeout(8000);

    // More exploration
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(200 + (i % 10) * 80, 150 + Math.floor(i / 10) * 100);
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(5000);

    // Switch maps if buttons exist
    for (const map of ['Desert', 'Ocean', 'Jungle', 'Hel', 'Garden']) {
      try {
        const btn = page.getByText(map, { exact: true }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 1500 });
          await page.waitForTimeout(3000);
          runMeta.steps.push({ switchedMap: map });
        }
      } catch {/* ignore */}
    }
    await page.waitForTimeout(4000);

    // Let pending response handlers finish
    await page.waitForTimeout(2000);

    console.log('Dumping storage…');
    const storage = await dumpStorage(page);
    fs.writeFileSync(path.join(OUT, 'reports', 'storage-dump.json'), JSON.stringify(storage, null, 2));
    const cacheSaved = await exportCacheBodies(page, storage);
    runMeta.steps.push({ cacheExported: cacheSaved.length });

    // Screenshot for evidence
    await page.screenshot({ path: path.join(OUT, 'reports', 'screenshot.png'), fullPage: true });

    // HTML snapshot
    const html = await page.content();
    fs.writeFileSync(path.join(OUT, 'html', 'page-snapshot.html'), html);

    // Collect performance resource timings (URLs only)
    const perf = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => ({
        name: e.name,
        initiatorType: e.initiatorType,
        transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize,
      }))
    );
    fs.writeFileSync(path.join(OUT, 'network', 'performance-resources.json'), JSON.stringify(perf, null, 2));

    runMeta.finishedAt = new Date().toISOString();
    runMeta.resourceCount = resources.size;
    runMeta.networkEntries = networkLog.length;
    runMeta.errors = errors;
    fs.writeFileSync(path.join(OUT, 'reports', 'run-meta.json'), JSON.stringify(runMeta, null, 2));
  } catch (e) {
    runMeta.fatal = String(e);
    runMeta.stack = e.stack;
    fs.writeFileSync(path.join(OUT, 'reports', 'run-meta.json'), JSON.stringify(runMeta, null, 2));
    console.error('Fatal:', e);
  } finally {
    writeHar();
    writeManifest();
    await browser.close();
  }

  const list = [...resources.values()];
  const total = list.reduce((a, b) => a + b.size, 0);
  console.log(JSON.stringify({ files: list.length, bytes: total, errors: errors.length }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
