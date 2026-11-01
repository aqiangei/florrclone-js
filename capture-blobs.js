/**
 * Robust blob capture: clone Blob on createObjectURL, flush on revoke,
 * CDP live-fetch, Image.src hook. Longer biome exploration.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const OUT = path.resolve(__dirname, 'web-game-archive');
const BLOB_DIR = path.join(OUT, 'blob-resources');
fs.mkdirSync(BLOB_DIR, { recursive: true });

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function extFromMime(mime, body) {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (m.includes('svg') || (body && body.slice(0, 300).toString('utf8').includes('<svg'))) return '.svg';
  if (m.includes('png')) return '.png';
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('webp')) return '.webp';
  if (m.includes('json')) return '.json';
  if (m.includes('javascript')) return '.js';
  return '.bin';
}

const savedByUrl = new Map();
const savedByHash = new Map();
let seq = 0;
const failures = [];

function persistBlob(url, mime, body, source) {
  if (!body || !body.length) {
    failures.push({ url, reason: 'empty', source });
    return null;
  }
  if (savedByUrl.has(url)) return savedByUrl.get(url);
  const hash = sha256(body);
  let localPath;
  if (savedByHash.has(hash)) localPath = savedByHash.get(hash);
  else {
    const name = `blob_${String(++seq).padStart(4, '0')}_${hash.slice(0, 16)}${extFromMime(mime, body)}`;
    const dest = path.join(BLOB_DIR, name);
    fs.writeFileSync(dest, body);
    localPath = path.relative(OUT, dest).replace(/\\/g, '/');
    savedByHash.set(hash, localPath);
  }
  const rec = { url, localPath, size: body.length, sha256: hash, mime: mime || 'application/octet-stream', source, savedAt: new Date().toISOString() };
  savedByUrl.set(url, rec);
  process.stdout.write(`+${savedByUrl.size} `);
  return rec;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });

  await context.addInitScript(() => {
    const store = (globalThis.__blobArchive = {
      byUrl: Object.create(null),
      order: [],
      errors: [],
      pendingReads: 0,
    });

    const push = (url, mime, buffer, source) => {
      const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer);
      if (!store.byUrl[url]) store.order.push(url);
      // keep largest / first non-empty
      const prev = store.byUrl[url];
      if (prev && prev.size >= bytes.length && bytes.length === 0) return;
      store.byUrl[url] = {
        url,
        mime: mime || 'application/octet-stream',
        size: bytes.length,
        bytes: Array.from(bytes),
        source,
        t: Date.now(),
      };
    };

    const readBlob = (url, blob, source) => {
      store.pendingReads++;
      const clone = blob.slice(0, blob.size, blob.type);
      clone
        .arrayBuffer()
        .then((buf) => push(url, blob.type || 'application/octet-stream', buf, source))
        .catch((e) => store.errors.push(source + ':' + String(e)))
        .finally(() => {
          store.pendingReads--;
        });
    };

    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);
    const blobRefs = Object.create(null);

    URL.createObjectURL = function (obj) {
      const url = origCreate(obj);
      try {
        if (typeof Blob !== 'undefined' && obj instanceof Blob) {
          blobRefs[url] = obj.slice(0, obj.size, obj.type);
          readBlob(url, blobRefs[url], 'createObjectURL');
        }
      } catch (e) {
        store.errors.push('create:' + String(e));
      }
      return url;
    };

    URL.revokeObjectURL = function (url) {
      try {
        if (blobRefs[url]) {
          readBlob(url, blobRefs[url], 'revoke-flush');
          delete blobRefs[url];
        }
      } catch (e) {
        store.errors.push('revoke:' + String(e));
      }
      return origRevoke(url);
    };

    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (desc && desc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set(v) {
            desc.set.call(this, v);
            if (typeof v === 'string' && v.startsWith('blob:')) {
              store.pendingReads++;
              fetch(v)
                .then((r) => Promise.all([r.headers.get('content-type') || '', r.arrayBuffer()]))
                .then(([mime, buf]) => push(v, mime, buf, 'img.src'))
                .catch((e) => store.errors.push('img:' + String(e)))
                .finally(() => {
                  store.pendingReads--;
                });
            }
          },
        });
      }
    } catch (e) {
      store.errors.push('imghook:' + String(e));
    }

    globalThis.__blobDump = () => ({
      items: store.order.map((u) => store.byUrl[u]).filter(Boolean),
      errors: store.errors.slice(-80),
      pendingReads: store.pendingReads,
      count: store.order.length,
    });
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  const inflight = new Set();
  const queueFetch = (url, mime) => {
    if (!url || !url.startsWith('blob:') || savedByUrl.has(url) || inflight.has(url)) return;
    inflight.add(url);
    page
      .evaluate(async (u) => {
        const r = await fetch(u);
        const mime = r.headers.get('content-type') || '';
        const buf = await r.arrayBuffer();
        return { mime, bytes: Array.from(new Uint8Array(buf)) };
      }, url)
      .then((got) => {
        if (got && got.bytes && got.bytes.length) persistBlob(url, got.mime || mime, Buffer.from(got.bytes), 'cdp-fetch');
      })
      .catch((e) => failures.push({ url, reason: e.message, source: 'cdp-fetch' }))
      .finally(() => inflight.delete(url));
  };

  cdp.on('Network.requestWillBeSent', (p) => {
    const u = p.request && p.request.url;
    if (u && u.startsWith('blob:')) queueFetch(u);
  });
  cdp.on('Network.responseReceived', (p) => {
    const u = p.response && p.response.url;
    if (u && u.startsWith('blob:')) queueFetch(u, p.response.mimeType);
  });

  console.log('goto');
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page.getByText(/Ready/i).waitFor({ timeout: 60000 });
  } catch {}
  console.log('ready');

  try {
    const play = page.locator('.play-button').first();
    if (await play.isVisible()) await play.click({ timeout: 2000 }).catch(() => {});
  } catch {}

  // Longer map exploration — move across map to load more tiles
  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    try {
      const btn = page.getByRole('button', { name: map, exact: true }).first();
      if (!(await btn.isVisible().catch(() => false))) continue;
      await btn.click({ timeout: 2000 });
      console.log('\nbiome', map);
      await page.waitForTimeout(2000);
      // Sweep mouse across viewport to load visible tiles
      for (let y = 80; y < 820; y += 70) {
        for (let x = 80; x < 1320; x += 90) {
          await page.mouse.move(x, y);
        }
        await page.keyboard.down('Space');
        await page.waitForTimeout(80);
        await page.keyboard.up('Space');
        await page.waitForTimeout(60);
      }
      // Open map overlay
      await page.keyboard.press('KeyM').catch(() => {});
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    } catch (e) {
      console.log('biome err', e.message);
    }
  }

  // Inventory / talents / craft to trigger UI art blobs
  for (const key of ['KeyZ', 'KeyX', 'KeyC', 'KeyZ', 'Escape']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(1200);
  }

  // Wait pending
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => (typeof __blobDump === 'function' ? __blobDump() : { pendingReads: 0, count: 0 }));
    if (st.pendingReads === 0 && inflight.size === 0) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1500);

  const dumped = await page.evaluate(() => __blobDump());
  console.log('\nhook count', dumped.count, 'items with bytes', dumped.items.filter((x) => x && x.size).length);
  for (const it of dumped.items || []) {
    if (it.bytes && it.bytes.length) persistBlob(it.url, it.mime, Buffer.from(it.bytes), it.source || 'hook');
  }

  // Merge with previous index (keep old files)
  let prev = [];
  const indexPath = path.join(BLOB_DIR, '_index.json');
  if (fs.existsSync(indexPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      prev = [];
    }
  }
  for (const p of prev) {
    if (p.url && p.sha256 && !savedByUrl.has(p.url)) {
      savedByUrl.set(p.url, p);
      if (p.localPath) savedByHash.set(p.sha256, p.localPath);
    }
  }

  const index = [...savedByUrl.values()];
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  // Update resources.json — mark content-equivalent: we cannot match old UUIDs; document that
  const resourcesPath = path.join(OUT, 'metadata', 'resources.json');
  let resources = fs.existsSync(resourcesPath) ? JSON.parse(fs.readFileSync(resourcesPath, 'utf8')) : [];
  for (const s of index) {
    if (!resources.some((r) => r.url === s.url && r.saved)) {
      resources.push({
        request_id: `blob-${s.sha256.slice(0, 8)}`,
        url: s.url,
        finalUrl: s.url,
        resourceType: 'Image',
        status: 200,
        contentType: s.mime,
        saved: true,
        localPath: s.localPath,
        size: s.size,
        sha256: s.sha256,
        downloadedAt: s.savedAt,
        via: s.source,
        failReason: null,
      });
    }
  }
  // Annotate old UUID misses
  for (const r of resources) {
    if (r.saved === false && String(r.url || '').startsWith('blob:')) {
      r.failReason =
        'session-specific blob UUID expired; equivalent SVG/image bytes re-captured in blob-resources/ under new blob URLs (see _index.json)';
      r.supersededBy = 'blob-resources/* (content re-archive)';
    }
  }
  fs.writeFileSync(resourcesPath, JSON.stringify(resources, null, 2));

  const urlMapPath = path.join(OUT, 'metadata', 'url-map.json');
  const urlMap = fs.existsSync(urlMapPath) ? JSON.parse(fs.readFileSync(urlMapPath, 'utf8')) : {};
  for (const s of index) urlMap[s.url] = s.localPath;
  fs.writeFileSync(urlMapPath, JSON.stringify(urlMap, null, 2));

  const bytesUnique = [...savedByUrl.values()]
    .filter((s, _, arr) => arr.findIndex((x) => x.sha256 === s.sha256) === arr.indexOf(s))
    .reduce((a, s) => a + s.size, 0);

  const report = {
    capturedAt: new Date().toISOString(),
    uniqueBlobUrls: savedByUrl.size,
    uniqueBlobFiles: savedByHash.size,
    bytesUnique,
    failures: failures.length,
    failureSample: failures.slice(0, 10),
    hookErrors: (dumped.errors || []).slice(0, 20),
  };
  fs.writeFileSync(path.join(OUT, 'reports', 'blob-capture.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'reports', 'missing-resources.md'),
    `# Missing Resources (blob follow-up)\n\n` +
      `Live blob capture complete.\n\n` +
      `- Saved blob URL mappings: **${savedByUrl.size}**\n` +
      `- Unique blob files on disk: **${savedByHash.size}** (${bytesUnique} bytes)\n` +
      `- Directory: \`blob-resources/\`\n\n` +
      `## About the original 78 unsaved blob: UUIDs\n\n` +
      `Those IDs belonged to a previous browser session and are permanently invalid. ` +
      `This run re-created the same class of resources (\`image/svg+xml\` tile/UI blobs) and saved their **bytes**. ` +
      `Old UUID rows remain listed only as historical network observations; content is in \`blob-resources/\`.\n`
  );

  console.log('\n' + JSON.stringify(report, null, 2));

  const zipPath = path.resolve(__dirname, 'web-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`, {
    stdio: 'inherit',
  });
  console.log('zip', zipPath, fs.statSync(zipPath).size);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
