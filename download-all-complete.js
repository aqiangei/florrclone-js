/**
 * Exhaustive static + live network download for https://152.32.173.78
 * Rejects SPA HTML fallbacks for non-HTML paths. Credentials via env.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const ORIGIN = process.env.TARGET_URL
  ? new URL(process.env.TARGET_URL).origin
  : 'https://152.32.173.78';
const USER = process.env.GAME_USER || '';
const PASS = process.env.GAME_PASS || '';
const OUT = path.resolve(__dirname, 'web-game-archive');
const SITE = path.resolve(__dirname, 'florr-local-site');
const REPORT = path.join(OUT, 'reports');

if (!PASS) {
  console.error('GAME_PASS required');
  process.exit(1);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        rejectUnauthorized: false,
        timeout: 120000,
        headers: { 'User-Agent': 'full-dl-complete/1.0', Accept: '*/*' },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuf(new URL(res.headers.location, url).href).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers || {},
            body: Buffer.concat(chunks),
          })
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

function urlToRel(url) {
  try {
    const u = new URL(url, ORIGIN);
    let p = u.pathname.replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    return p.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  } catch {
    return 'unknown_' + sha256(Buffer.from(String(url))).slice(0, 12);
  }
}

function isSpaHtml(body, url, contentType) {
  const ct = String(contentType || '').toLowerCase();
  const rel = urlToRel(url);
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.html' || ext === '.htm' || rel.endsWith('/index.html') || rel === 'index.html') return false;
  if (ct.includes('text/html')) return true;
  const head = body.slice(0, 32).toString('utf8').trimStart();
  if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.startsWith('<!doctype')) {
    if (/\.(js|mjs|css|json|svg|png|jpe?g|webp|gif|woff2?|ttf|wasm|webmanifest)$/i.test(rel)) return true;
  }
  return false;
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

const seen = new Map(); // url -> {status, bytes, sha, local, rejected?}
const queue = [];
const queued = new Set();

function enqueue(u) {
  if (!u) return;
  let abs;
  try {
    if (u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('mailto:') || u.startsWith('javascript:')) return;
    abs = new URL(u, ORIGIN).href;
  } catch {
    return;
  }
  if (!abs.startsWith(ORIGIN)) return;
  // strip hash
  abs = abs.split('#')[0];
  if (queued.has(abs)) return;
  queued.add(abs);
  queue.push(abs);
}

function extractPathsFromText(text) {
  const out = [];
  const re = /(?:["'`(=]|^|\s)(\/(?:_next|assets|fonts|api|manifest\.webmanifest|favicon\.svg)[^"'`\s)>\]]*)/g;
  let m;
  while ((m = re.exec(text))) {
    let p = m[1].replace(/\\/g, '');
    p = p.replace(/[),;]+$/, '');
    try {
      p = decodeURIComponent(p);
    } catch {}
    if (p.includes('${') || p.includes('...') || p.length > 400) continue;
    out.push(p);
  }
  // also absolute same-origin
  const re2 = new RegExp(
    ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/[^"\'\\s)>\]]+)',
    'g'
  );
  while ((m = re2.exec(text))) out.push(m[1]);
  return out;
}

function saveBody(url, body, contentType, source) {
  const rel = urlToRel(url);
  const folder = classify(url, contentType);
  const arch = path.join(OUT, folder, rel);
  const site = path.join(SITE, ...rel.split('/'));
  ensureDir(path.dirname(arch));
  ensureDir(path.dirname(site));
  fs.writeFileSync(arch, body);
  fs.writeFileSync(site, body);
  const meta = {
    url,
    status: 200,
    bytes: body.length,
    sha256: sha256(body),
    local: path.relative(OUT, arch).replace(/\\/g, '/'),
    contentType: contentType || '',
    source,
  };
  seen.set(url, meta);
  return meta;
}

async function downloadOne(url, source) {
  if (seen.has(url) && seen.get(url).status === 200 && !seen.get(url).rejected) return seen.get(url);
  try {
    const res = await fetchBuf(url);
    if (res.status !== 200) {
      const meta = { url, status: res.status, bytes: 0, rejected: false, source, error: 'http ' + res.status };
      seen.set(url, meta);
      return meta;
    }
    const ct = res.headers['content-type'] || '';
    if (isSpaHtml(res.body, url, ct)) {
      const meta = {
        url,
        status: 200,
        bytes: res.body.length,
        rejected: true,
        reason: 'spa-html-fallback',
        contentType: ct,
        source,
      };
      seen.set(url, meta);
      return meta;
    }
    const meta = saveBody(url, res.body, ct, source);
    // harvest more urls from text-ish assets
    const ext = path.extname(urlToRel(url)).toLowerCase();
    if (['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.svg'].includes(ext) || /javascript|css|html|json|svg/i.test(ct)) {
      try {
        const text = res.body.toString('utf8');
        for (const p of extractPathsFromText(text)) enqueue(p);
      } catch {}
    }
    return meta;
  } catch (e) {
    const meta = { url, status: 0, bytes: 0, error: e.message, source };
    seen.set(url, meta);
    return meta;
  }
}

async function drainHttp(label) {
  console.log(`[${label}] queue`, queue.length);
  let i = 0;
  const conc = 12;
  let ok = 0;
  let reject = 0;
  let fail = 0;
  async function worker() {
    while (i < queue.length) {
      const idx = i++;
      const url = queue[idx];
      const r = await downloadOne(url, label);
      if (r.rejected) reject++;
      else if (r.status === 200) ok++;
      else fail++;
      if ((ok + reject + fail) % 40 === 0) {
        process.stdout.write(`  ok=${ok} rejectHtml=${reject} fail=${fail} q=${queue.length - i}+${i}\n`);
      }
    }
  }
  // loop until queue stable (new refs discovered while downloading)
  let guard = 0;
  while (guard++ < 20) {
    const startLen = queue.length;
    const startI = i;
    await Promise.all(Array.from({ length: conc }, () => worker()));
    if (queue.length === startLen && i >= startLen) break;
    // continue with newly enqueued
  }
  console.log(`[${label}] done ok=${ok} rejectHtml=${reject} fail=${fail} totalSeen=${seen.size}`);
}

async function captureLive() {
  console.log('browser capture鈥?);
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--ignore-certificate-errors'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url.startsWith(ORIGIN) && !url.startsWith('blob:')) return;
      if (url.startsWith('blob:')) return; // handled separately below
      const status = response.status();
      if (status !== 200) return;
      const ct = response.headers()['content-type'] || '';
      const body = await response.body().catch(() => null);
      if (!body || !body.length) return;
      if (isSpaHtml(body, url, ct)) {
        seen.set(url, { url, status, bytes: body.length, rejected: true, reason: 'spa-html-fallback', source: 'live' });
        return;
      }
      if (!seen.has(url) || seen.get(url).rejected || (seen.get(url).bytes || 0) < body.length) {
        saveBody(url, body, ct, 'live');
        try {
          const text = body.toString('utf8');
          for (const p of extractPathsFromText(text)) enqueue(p);
        } catch {}
      }
    } catch {}
  });

  // disable blob revoke so we can harvest
  await page.addInitScript(() => {
    const orig = URL.revokeObjectURL;
    URL.revokeObjectURL = function () {};
    window.__blobKeep = orig;
  });

  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByText(/Ready/i).waitFor({ timeout: 90000 }).catch(() => {});

  // login
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
  await page.waitForTimeout(5000);
  try {
    const ready = page.getByRole('button', { name: /ready|play/i }).first();
    if (await ready.isVisible({ timeout: 2000 }).catch(() => false)) await ready.click();
  } catch {}

  // force-load every manifest image
  const manPath = path.join(SITE, 'assets', 'manifest.json');
  if (fs.existsSync(manPath)) {
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    const srcs = [...new Set(Object.values(man).map((v) => v && v.src).filter(Boolean))];
    console.log('prefetch images', srcs.length);
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
      await page.waitForTimeout(200);
    }
  }

  // tiles
  const tilesDir = path.join(SITE, 'assets', 'world-tiles');
  if (fs.existsSync(tilesDir)) {
    const tiles = fs
      .readdirSync(tilesDir)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => '/assets/world-tiles/' + f);
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

  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    const btn = page.getByText(map, { exact: true }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      console.log('biome', map);
      await page.waitForTimeout(2000);
      for (let i = 0; i < 40; i++) {
        await page.mouse.move(140 + (i % 10) * 90, 120 + Math.floor(i / 10) * 90);
        if (i % 5 === 0) {
          await page.keyboard.down('Space');
          await page.waitForTimeout(100);
          await page.keyboard.up('Space');
        }
        await page.waitForTimeout(30);
      }
    }
  }

  for (const k of ['KeyZ', 'KeyX', 'KeyC', 'KeyM', 'KeyR', 'Escape', 'KeyZ']) {
    await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(800);
  }

  await page.waitForTimeout(2000);
  await browser.close();
  console.log('browser closed, seen=', seen.size);
}

function recount() {
  const folders = [
    'pages',
    'scripts',
    'styles',
    'wasm',
    'workers',
    'images',
    'audio',
    'video',
    'fonts',
    'configs',
    'binary',
  ];
  function walk(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      if (fs.statSync(f).isDirectory()) walk(f, acc);
      else acc.push(f);
    }
    return acc;
  }
  const byFolder = {};
  let files = 0;
  let bytes = 0;
  for (const f of folders) {
    const list = walk(path.join(OUT, f));
    byFolder[f] = list.length;
    files += list.length;
    bytes += list.reduce((a, p) => a + fs.statSync(p).size, 0);
  }
  const ok = [...seen.values()].filter((x) => x.status === 200 && !x.rejected);
  const rejected = [...seen.values()].filter((x) => x.rejected);
  const failed = [...seen.values()].filter((x) => x.status !== 200 && !x.rejected);
  const stats = {
    finishedAt: new Date().toISOString(),
    origin: ORIGIN,
    savedContentFiles: files,
    totalBytes: bytes,
    byFolder,
    downloadedOk: ok.length,
    rejectedSpaHtml: rejected.length,
    failed: failed.length,
    failedSample: failed.slice(0, 40),
    rejectedSample: rejected.slice(0, 40).map((x) => x.url),
  };
  ensureDir(REPORT);
  fs.writeFileSync(path.join(REPORT, 'complete-download-stats.json'), JSON.stringify(stats, null, 2));
  fs.writeFileSync(
    path.join(REPORT, 'complete-download-index.json'),
    JSON.stringify([...seen.values()], null, 2)
  );
  return stats;
}

(async () => {
  ensureDir(OUT);
  ensureDir(SITE);
  ensureDir(REPORT);

  // seed
  enqueue('/');
  enqueue('/manifest.webmanifest');
  enqueue('/favicon.svg');
  enqueue('/assets/manifest.json');
  enqueue('/fonts/ubuntu-bold.ttf');

  // known talent icons
  for (const t of [
    'health',
    'medic',
    'summoner',
    'secondChance',
    'reload',
    'rotation',
    'antennae',
    'luck',
    'petalHealth',
    'poison',
    'reach',
    'sharpEdges',
    'magnetism',
    'duplicator',
    'bodyToxicity',
    'concentratedPoison',
    'loadout',
  ]) {
    enqueue(`/assets/talents/${t}.svg`);
  }

  // 1) http crawl expanding refs
  await drainHttp('seed-crawl');

  // harvest from local page/js already present
  for (const root of [SITE, path.join(OUT, 'scripts'), path.join(OUT, 'styles'), path.join(OUT, 'pages')]) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const d = stack.pop();
      for (const n of fs.readdirSync(d)) {
        const f = path.join(d, n);
        const st = fs.statSync(f);
        if (st.isDirectory()) stack.push(f);
        else if (/\.(js|mjs|css|html|json)$/i.test(n)) {
          try {
            for (const p of extractPathsFromText(fs.readFileSync(f, 'utf8'))) enqueue(p);
          } catch {}
        }
      }
    }
  }
  // manifest srcs
  const manPath = path.join(SITE, 'assets', 'manifest.json');
  if (fs.existsSync(manPath)) {
    try {
      const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
      for (const v of Object.values(man)) if (v && v.src) enqueue(v.src);
    } catch {}
  }

  await drainHttp('expand-crawl');

  // 2) live browser (login + biomes) to catch dynamic / api / new hashes
  await captureLive();

  // 3) drain anything discovered live
  await drainHttp('post-live');

  const stats = recount();
  console.log(JSON.stringify(stats, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
