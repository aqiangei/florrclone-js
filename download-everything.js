/**
 * Full client download: all public URL refs + live blob capture (revoke disabled).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const ORIGIN = process.env.TARGET_URL
  ? new URL(process.env.TARGET_URL).origin
  : 'https://152.32.173.78';
const USER = process.env.GAME_USER || '';
const PASS = process.env.GAME_PASS || '';
const FORCE = process.env.FORCE_REDOWNLOAD !== '0';
const OUT = path.resolve(__dirname, 'web-game-archive');
const SITE = path.resolve(__dirname, 'florr-local-site');
const PREV = path.resolve(__dirname, 'florr-site-download');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { rejectUnauthorized: false, timeout: 90000, headers: { 'User-Agent': 'full-dl/1.0' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuf(new URL(res.headers.location, url).href).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) walk(f, acc);
    else acc.push(f);
  }
  return acc;
}

function collectUrls() {
  const urls = new Set();
  const add = (p) => {
    if (!p) return;
    if (p.startsWith('http')) urls.add(p);
    else if (p.startsWith('/')) urls.add(ORIGIN + p);
  };

  // manifests
  for (const mp of [
    path.join(PREV, 'json', 'manifest.json'),
    path.join(SITE, 'assets', 'manifest.json'),
    path.join(OUT, 'configs', 'assets', 'manifest.json'),
  ]) {
    if (!fs.existsSync(mp)) continue;
    try {
      const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
      for (const v of Object.values(man)) {
        if (v && v.src) add(v.src);
      }
    } catch {}
  }

  // scan text for paths
  const roots = [
    path.join(PREV, 'js'),
    path.join(PREV, 'html'),
    path.join(OUT, 'scripts'),
    path.join(OUT, 'pages'),
    path.join(OUT, 'styles'),
    path.join(SITE, '_next'),
  ];
  const re = /(\/(?:assets|fonts|_next\/static)\/[A-Za-z0-9._\-/%]+\.[A-Za-z0-9]{1,8})/g;
  for (const root of roots) {
    for (const file of walk(root)) {
      if (!/\.(js|css|html|json|webmanifest)$/i.test(file)) continue;
      const st = fs.statSync(file);
      if (st.size > 20_000_000) continue;
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        let p = m[1].replace(/["'`)\]},;]+$/, '');
        try {
          p = decodeURIComponent(p);
        } catch {}
        add(p);
      }
    }
  }

  // talents known + common roots
  const talents = [
    'health', 'medic', 'summoner', 'secondChance', 'reload', 'rotation', 'antennae', 'luck',
    'petalHealth', 'poison', 'reach', 'sharpEdges', 'magnetism', 'duplicator', 'bodyToxicity',
    'concentratedPoison', 'loadout',
  ];
  for (const t of talents) add(`/assets/talents/${t}.svg`);
  add('/favicon.svg');
  add('/manifest.webmanifest');
  add('/assets/manifest.json');
  add('/fonts/ubuntu-bold.ttf');
  add('/');

  return [...urls];
}

function classify(url, ct) {
  const u = url.toLowerCase();
  const c = (ct || '').toLowerCase();
  if (u.includes('worker')) return 'workers';
  if (u.endsWith('.wasm') || c.includes('wasm')) return 'wasm';
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(u) || c.startsWith('image/')) return 'images';
  if (/\.(mp3|ogg|wav)(\?|$)/i.test(u) || c.startsWith('audio/')) return 'audio';
  if (/\.(mp4|webm)(\?|$)/i.test(u) || c.startsWith('video/')) return 'video';
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || c.includes('font')) return 'fonts';
  if (/\.css(\?|$)/i.test(u) || c.includes('css')) return 'styles';
  if (/\.(js|mjs)(\?|$)/i.test(u) || c.includes('javascript')) return 'scripts';
  if (/\.(html?)(\?|$)/i.test(u) || c.includes('html')) return 'pages';
  if (/\.(json|webmanifest|xml|ya?ml|csv|txt)(\?|$)/i.test(u) || c.includes('json')) return 'configs';
  return 'binary';
}

function urlToRel(url) {
  try {
    const u = new URL(url);
    let p = u.pathname.replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    return p.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  } catch {
    return 'unknown_' + sha256(Buffer.from(url)).slice(0, 12);
  }
}

async function downloadAllHttp(urls) {
  console.log('HTTP candidates', urls.length);
  const results = { ok: 0, skip: 0, fail: 0, fails: [] };
  let i = 0;
  const conc = 10;
  async function worker() {
    while (i < urls.length) {
      const idx = i++;
      const url = urls[idx];
      const folder = classify(url, '');
      const rel = urlToRel(url);
      const destArchive = path.join(OUT, folder, rel);
      const destSite = path.join(SITE, ...rel.split('/'));
      if (!FORCE && fs.existsSync(destArchive) && fs.statSync(destArchive).size > 0) {
        results.skip++;
        // ensure site copy
        if (!fs.existsSync(destSite)) {
          fs.mkdirSync(path.dirname(destSite), { recursive: true });
          fs.copyFileSync(destArchive, destSite);
        }
        continue;
      }
      try {
        const res = await fetchBuf(url);
        if (res.status !== 200) {
          results.fail++;
          results.fails.push({ url, status: res.status });
          continue;
        }
        fs.mkdirSync(path.dirname(destArchive), { recursive: true });
        fs.writeFileSync(destArchive, res.body);
        fs.mkdirSync(path.dirname(destSite), { recursive: true });
        fs.writeFileSync(destSite, res.body);
        // also assets-full style under PREV
        const destPrev = path.join(PREV, 'assets-full', ...rel.split('/'));
        fs.mkdirSync(path.dirname(destPrev), { recursive: true });
        fs.writeFileSync(destPrev, res.body);
        results.ok++;
        if (results.ok % 50 === 0) console.log('downloaded', results.ok);
      } catch (e) {
        results.fail++;
        results.fails.push({ url, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, () => worker()));
  console.log('HTTP done', results);
  return results;
}

async function captureAllBlobs() {
  const BLOB = path.join(OUT, 'blob-resources');
  fs.mkdirSync(BLOB, { recursive: true });
  const byUrl = new Map();
  const byHash = new Map();
  // load existing
  const indexPath = path.join(BLOB, '_index.json');
  if (fs.existsSync(indexPath)) {
    for (const it of JSON.parse(fs.readFileSync(indexPath, 'utf8'))) {
      byUrl.set(it.url, it);
      if (it.sha256) byHash.set(it.sha256, it.localPath);
    }
  }
  let seq = byHash.size;

  function save(url, mime, body, source) {
    if (!body || !body.length) return;
    if (byUrl.has(url) && byUrl.get(url).size >= body.length) return;
    const hash = sha256(body);
    let lp = byHash.get(hash);
    if (!lp) {
      let ext = '.bin';
      const m = (mime || '').toLowerCase();
      if (m.includes('svg') || body.slice(0, 200).toString('utf8').includes('<svg')) ext = '.svg';
      else if (m.includes('png')) ext = '.png';
      else if (m.includes('jpeg') || m.includes('jpg')) ext = '.jpg';
      else if (m.includes('webp')) ext = '.webp';
      else if (m.includes('json')) ext = '.json';
      else if (m.includes('javascript')) ext = '.js';
      lp = `blob-resources/blob_${String(++seq).padStart(4, '0')}_${hash.slice(0, 16)}${ext}`;
      fs.writeFileSync(path.join(OUT, lp), body);
      byHash.set(hash, lp);
    }
    byUrl.set(url, {
      url,
      localPath: lp,
      size: body.length,
      sha256: hash,
      mime: mime || 'application/octet-stream',
      source,
      savedAt: new Date().toISOString(),
    });
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });

  // Never lose blob bytes: clone on create, noop revoke, keep all
  await context.addInitScript(() => {
    const S = (globalThis.__BA = { byUrl: Object.create(null), order: [], pending: 0, errors: [] });
    const push = (url, mime, buf, source) => {
      const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf);
      if (!S.byUrl[url]) S.order.push(url);
      const prev = S.byUrl[url];
      if (prev && prev.size > bytes.length) return;
      S.byUrl[url] = { url, mime, size: bytes.length, bytes: Array.from(bytes), source, t: Date.now() };
    };
    const read = (url, blob, source) => {
      S.pending++;
      const clone = blob.slice(0, blob.size, blob.type);
      clone
        .arrayBuffer()
        .then((b) => push(url, blob.type || 'application/octet-stream', b, source))
        .catch((e) => S.errors.push(String(e)))
        .finally(() => {
          S.pending--;
        });
    };
    const refs = Object.create(null);
    const oc = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      const url = oc(obj);
      if (typeof Blob !== 'undefined' && obj instanceof Blob) {
        refs[url] = obj.slice(0, obj.size, obj.type);
        read(url, refs[url], 'createObjectURL');
      }
      return url;
    };
    // Keep blobs alive for the whole session
    URL.revokeObjectURL = function () {
      /* no-op: retain for archive */
    };

    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (desc && desc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          configurable: true,
          enumerable: true,
          get: desc.get,
          set(v) {
            desc.set.call(this, v);
            if (typeof v === 'string' && v.startsWith('blob:')) {
              S.pending++;
              fetch(v)
                .then(async (r) => {
                  const mime = r.headers.get('content-type') || '';
                  push(v, mime, await r.arrayBuffer(), 'img.src');
                })
                .catch((e) => S.errors.push(String(e)))
                .finally(() => {
                  S.pending--;
                });
            }
          },
        });
      }
    } catch {}

    globalThis.__BD = () => ({
      items: S.order.map((u) => S.byUrl[u]).filter(Boolean),
      pending: S.pending,
      count: S.order.length,
      errors: S.errors.slice(-40),
    });
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const seenNet = new Set();
  const inflight = new Set();

  const pull = (url, mime) => {
    if (!url || !url.startsWith('blob:') || byUrl.has(url) || inflight.has(url)) return;
    inflight.add(url);
    seenNet.add(url);
    page
      .evaluate(async (u) => {
        const r = await fetch(u);
        return { mime: r.headers.get('content-type') || '', bytes: Array.from(new Uint8Array(await r.arrayBuffer())) };
      }, url)
      .then((g) => {
        if (g && g.bytes && g.bytes.length) save(url, g.mime || mime, Buffer.from(g.bytes), 'cdp');
      })
      .catch(() => {})
      .finally(() => inflight.delete(url));
  };

  cdp.on('Network.requestWillBeSent', (p) => {
    const u = p.request && p.request.url;
    if (u && u.startsWith('blob:')) pull(u);
  });
  cdp.on('Network.responseReceived', (p) => {
    const u = p.response && p.response.url;
    if (u && u.startsWith('blob:')) pull(u, p.response.mimeType);
  });

  // Also save every normal HTTP response body into archive (session pass)
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return;
      if (response.status() !== 200) return;
      const folder = classify(url, response.headers()['content-type'] || '');
      const rel = urlToRel(url);
      const dest = path.join(OUT, folder, rel);
      const body = await response.body().catch(() => null);
      if (!body || !body.length) return;
      if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size === body.length) {
        const siteDest = path.join(SITE, ...rel.split('/'));
        if (!fs.existsSync(siteDest)) {
          fs.mkdirSync(path.dirname(siteDest), { recursive: true });
          fs.writeFileSync(siteDest, body);
        }
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
      const siteDest = path.join(SITE, ...rel.split('/'));
      fs.mkdirSync(path.dirname(siteDest), { recursive: true });
      fs.writeFileSync(siteDest, body);
    } catch {}
  });

  console.log('browser goto');
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText(/Ready/i).waitFor({ timeout: 60000 }).catch(() => {});
  console.log('ready');

  if (PASS) {
    console.log('login as', USER);
    await page.getByRole('button', { name: /account|profile/i }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(
      ({ user, pass }) => {
        const panel =
          [...document.querySelectorAll('div,section,aside,dialog')].find((el) => {
            const t = el.innerText || '';
            return /Password/i.test(t) && t.length < 4000;
          }) || document.body;
        const inputs = [...panel.querySelectorAll('input')].filter(
          (i) => i.type !== 'hidden' && getComputedStyle(i).display !== 'none'
        );
        const pw = inputs.find((i) => i.type === 'password');
        const text = inputs.find((i) => i !== pw && i.type !== 'checkbox');
        const set = (el, v) => {
          const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          proto.set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        if (text) set(text, user);
        if (pw) set(pw, pass);
      },
      { user: USER, pass: PASS }
    );
    await page.getByRole('button', { name: /log in & play|log in/i }).last().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(4000);
    try {
      const ready = page.getByRole('button', { name: /ready|play/i }).first();
      if (await ready.isVisible({ timeout: 1500 }).catch(() => false)) await ready.click();
    } catch {}
  }

  // Force-load every tile/petal/mob via Image in page (triggers same blob pipeline if used)
  const manPath = path.join(SITE, 'assets', 'manifest.json');
  if (fs.existsSync(manPath)) {
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    const srcs = Object.values(man).map((v) => v && v.src).filter(Boolean);
    console.log('prefetch images in page', srcs.length);
    // batch to avoid OOM
    for (let i = 0; i < srcs.length; i += 40) {
      const batch = srcs.slice(i, i + 40);
      await page.evaluate(async (list) => {
        await Promise.all(
          list.map(
            (src) =>
              new Promise((res) => {
                const img = new Image();
                img.onload = img.onerror = () => res();
                img.src = src;
              })
          )
        );
      }, batch);
      await page.waitForTimeout(300);
      if ((i / 40) % 5 === 0) process.stdout.write(`pref ${i}/${srcs.length} `);
    }
    console.log('\nprefetch done');
  }

  // Also load all world-tiles from local listing if present
  const tilesDir = path.join(SITE, 'assets', 'world-tiles');
  if (fs.existsSync(tilesDir)) {
    const tiles = fs.readdirSync(tilesDir).filter((f) => f.endsWith('.svg')).map((f) => '/assets/world-tiles/' + f);
    console.log('load tiles', tiles.length);
    for (let i = 0; i < tiles.length; i += 30) {
      await page.evaluate(async (list) => {
        await Promise.all(
          list.map(
            (src) =>
              new Promise((res) => {
                const img = new Image();
                img.onload = img.onerror = () => res();
                img.src = src;
              })
          )
        );
      }, tiles.slice(i, i + 30));
    }
  }

  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel', 'Garden']) {
    const btn = page.getByText(map, { exact: true }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      console.log('biome', map);
      await page.waitForTimeout(2500);
      for (let i = 0; i < 50; i++) {
        await page.mouse.move(150 + (i % 12) * 90, 120 + Math.floor(i / 12) * 100);
        if (i % 4 === 0) {
          await page.keyboard.down('Space');
          await page.waitForTimeout(120);
          await page.keyboard.up('Space');
        }
        await page.waitForTimeout(40);
      }
    }
  }

  for (const k of ['KeyZ', 'KeyX', 'KeyC', 'KeyM', 'KeyR', 'Escape', 'KeyZ']) {
    await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(1000);
  }

  for (let i = 0; i < 50; i++) {
    const st = await page.evaluate(() => __BD());
    if (st.pending === 0 && inflight.size === 0) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);

  const dump = await page.evaluate(() => __BD());
  console.log('blob hooked', dump.count, 'net seen', seenNet.size);
  for (const it of dump.items) {
    if (it.bytes && it.bytes.length) save(it.url, it.mime, Buffer.from(it.bytes), it.source || 'hook');
  }

  // Final fetch all still-alive blob URLs from order
  const alive = await page.evaluate(async () => {
    const d = __BD();
    const out = [];
    for (const it of d.items) {
      try {
        const r = await fetch(it.url);
        const bytes = Array.from(new Uint8Array(await r.arrayBuffer()));
        out.push({ url: it.url, mime: r.headers.get('content-type') || it.mime, bytes, ok: true });
      } catch (e) {
        out.push({ url: it.url, ok: false, error: String(e) });
      }
    }
    return out;
  });
  for (const a of alive) {
    if (a.ok && a.bytes && a.bytes.length) save(a.url, a.mime, Buffer.from(a.bytes), 'final-fetch');
  }

  fs.writeFileSync(indexPath, JSON.stringify([...byUrl.values()], null, 2));
  await browser.close();
  return { urls: byUrl.size, files: byHash.size, hooked: dump.count, net: seenNet.size };
}

function recountAndZip() {
  const folders = ['pages', 'scripts', 'styles', 'wasm', 'workers', 'images', 'audio', 'video', 'fonts', 'configs', 'binary', 'packages', 'blob-resources', 'data-resources'];
  let files = 0;
  let bytes = 0;
  const counts = {};
  for (const f of folders) {
    const list = walk(path.join(OUT, f)).filter((x) => !x.endsWith('_index.json'));
    counts[f] = list.length;
    files += list.length;
    bytes += list.reduce((a, p) => a + fs.statSync(p).size, 0);
  }
  const stats = {
    savedContentFiles: files,
    totalBytes: bytes,
    jsCount: counts.scripts || 0,
    wasmCount: counts.wasm || 0,
    workerCount: counts.workers || 0,
    blobFiles: counts['blob-resources'] || 0,
    imageFiles: counts.images || 0,
    byFolder: counts,
    finishedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(OUT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'reports', 'full-download-stats.json'), JSON.stringify(stats, null, 2));

  const zipPath = path.resolve(__dirname, 'web-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`, {
    stdio: 'inherit',
  });
  stats.zipPath = zipPath;
  stats.zipBytes = fs.statSync(zipPath).size;
  fs.writeFileSync(path.join(OUT, 'reports', 'full-download-stats.json'), JSON.stringify(stats, null, 2));
  return stats;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SITE, { recursive: true });
  const urls = collectUrls();
  const httpRes = await downloadAllHttp(urls);
  const blobRes = await captureAllBlobs();
  const stats = recountAndZip();
  console.log(
    JSON.stringify(
      {
        http: httpRes,
        blobs: blobRes,
        final: stats,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
