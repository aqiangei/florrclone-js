/**
 * Re-capture site with login; detect new/changed public client resources.
 * Password via GAME_PASS only — never written to reports.
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
const HOST = new URL(ORIGIN).hostname;
const USER = process.env.GAME_USER || '';
const PASS = process.env.GAME_PASS || '';
const OUT = path.resolve(__dirname, 'online-update-capture');
const SITE = path.resolve(__dirname, 'florr-local-site');
const PREV = path.resolve(__dirname, 'florr-site-download');

if (!PASS) {
  console.warn('GAME_PASS not set — guest / public resources only');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function redact(s) {
  if (!PASS) return String(s);
  return String(s).split(PASS).join('[REDACTED]');
}
function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a.map((x) => redact(x)));
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuf(new URL(res.headers.location, url).href).then(resolve, reject);
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

for (const d of ['js', 'css', 'images', 'workers', 'configs', 'html', 'fonts', 'network', 'websocket', 'reports', 'changed', 'new']) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

const seen = new Map(); // url -> {sha256, size, status, localPath, change}
const wsSessions = [];
const networkLog = [];

function classify(url, ct) {
  const u = url.toLowerCase();
  const c = (ct || '').toLowerCase();
  if (u.includes('worker')) return 'workers';
  if (u.endsWith('.css') || c.includes('text/css')) return 'css';
  if (u.endsWith('.js') || u.endsWith('.mjs') || c.includes('javascript')) return 'js';
  if (u.endsWith('.json') || c.includes('json') || u.includes('manifest')) return 'configs';
  if (u.endsWith('.html') || c.includes('text/html')) return 'html';
  if (/\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(u) || c.startsWith('image/')) return 'images';
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || c.startsWith('font/')) return 'fonts';
  return 'images';
}

function findPrevHash(url, bodyHash) {
  // Check florr-local-site mirror by pathname
  try {
    const u = new URL(url);
    const sitePath = path.join(SITE, ...u.pathname.replace(/^\/+/, '').split('/').filter(Boolean));
    if (fs.existsSync(sitePath)) {
      const h = sha256(fs.readFileSync(sitePath));
      return { path: sitePath, hash: h, same: h === bodyHash };
    }
  } catch {}
  // Check previous capture folders by basename
  const base = path.basename(new URL(url).pathname || '');
  if (!base) return null;
  const candidates = [
    path.join(PREV, 'js', base),
    path.join(PREV, 'assets', base),
    path.join(PREV, 'assets-full', 'assets', ...new URL(url).pathname.split('/').filter(Boolean).slice(1)),
    path.join(SITE, 'assets', base),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const h = sha256(fs.readFileSync(c));
      return { path: c, hash: h, same: h === bodyHash };
    }
  }
  return null;
}

async function saveBody(url, body, ct, status) {
  if (!body || !body.length) return;
  const hash = sha256(body);
  const prev = findPrevHash(url, hash);
  let change = 'new';
  if (prev) change = prev.same ? 'unchanged' : 'updated';

  const folder = classify(url, ct);
  let base = 'file';
  try {
    base = path.basename(new URL(url).pathname) || 'file';
  } catch {}
  base = decodeURIComponent(base).replace(/[<>:"|?*]/g, '_');
  if (!path.extname(base)) {
    if (folder === 'js') base += '.js';
    else if (folder === 'css') base += '.css';
    else if (folder === 'configs') base += '.json';
  }

  const dest = path.join(OUT, folder, base);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // avoid overwrite different content
  let finalDest = dest;
  if (fs.existsSync(dest) && sha256(fs.readFileSync(dest)) !== hash) {
    finalDest = path.join(OUT, folder, `${path.parse(base).name}__${hash.slice(0, 8)}${path.parse(base).ext}`);
  }
  fs.writeFileSync(finalDest, body);

  // also update local site mirror for play
  try {
    const u = new URL(url);
    if (u.hostname === HOST) {
      const sitePath = path.join(SITE, ...u.pathname.replace(/^\/+/, '').split('/').filter(Boolean));
      if (u.pathname === '/' || u.pathname === '') {
        fs.writeFileSync(path.join(SITE, 'index.html'), body);
      } else {
        fs.mkdirSync(path.dirname(sitePath), { recursive: true });
        fs.writeFileSync(sitePath, body);
      }
    }
  } catch {}

  if (change === 'updated') {
    fs.copyFileSync(finalDest, path.join(OUT, 'changed', path.basename(finalDest)));
  } else if (change === 'new') {
    fs.copyFileSync(finalDest, path.join(OUT, 'new', path.basename(finalDest)));
  }

  const rec = {
    url,
    status,
    contentType: ct,
    size: body.length,
    sha256: hash,
    change,
    localPath: path.relative(OUT, finalDest).replace(/\\/g, '/'),
    prevHash: prev ? prev.hash : null,
  };
  seen.set(url.split('#')[0], rec);
  return rec;
}

async function mapPool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    })
  );
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await (await context.newCDPSession(page)).send('Network.enable');

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes(HOST)) return;
    if (url.startsWith('data:') || url.includes('/ws')) return;
    const status = response.status();
    const ct = response.headers()['content-type'] || '';
    networkLog.push({ t: new Date().toISOString(), url, status, ct, type: response.request().resourceType() });
    if (status < 200 || status >= 400) return;
    try {
      const body = await response.body();
      await saveBody(url, body, ct, status);
    } catch {}
  });

  page.on('websocket', (ws) => {
    const s = { url: ws.url(), connectedAt: new Date().toISOString(), frames: 0, bytesIn: 0, bytesOut: 0, closedAt: null };
    wsSessions.push(s);
    log('WS', s.url);
    ws.on('framereceived', (ev) => {
      const p = ev.payload;
      const size = typeof p === 'string' ? Buffer.byteLength(p) : p.length;
      s.frames++;
      s.bytesIn += size;
    });
    ws.on('framesent', (ev) => {
      const p = ev.payload;
      const size = typeof p === 'string' ? Buffer.byteLength(p) : p.length;
      s.frames++;
      s.bytesOut += size;
    });
    ws.on('close', () => {
      s.closedAt = new Date().toISOString();
      log('WS close frames', s.frames);
    });
  });

  log('Goto', ORIGIN);
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() =>
    page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' })
  );
  await page.waitForTimeout(3000);
  try {
    await page.getByText(/Ready/i).waitFor({ timeout: 30000 });
  } catch {}

  if (PASS) {
    // Login
    log('Login as', USER);
    await page.getByRole('button', { name: /account|profile/i }).first().click({ timeout: 8000 });
    await page.waitForTimeout(800);
    await page.evaluate(({ user, pass }) => {
      const panel =
        [...document.querySelectorAll('div,section,aside,dialog')].find((el) => {
          const t = el.innerText || '';
          return /Password/i.test(t) && t.length < 4000;
        }) || document.body;
      const inputs = [...panel.querySelectorAll('input')].filter((i) => i.type !== 'hidden' && getComputedStyle(i).display !== 'none');
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
    }, { user: USER, pass: PASS });
    await page.getByRole('button', { name: /log in & play|log in/i }).last().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);
  } else {
    log('Guest play (no GAME_PASS)');
    try {
      const guest = page.getByRole('button', { name: /play|guest|offline|continue/i }).first();
      if (await guest.isVisible({ timeout: 2000 }).catch(() => false)) await guest.click();
    } catch {}
    await page.waitForTimeout(2000);
  }

  let ui = await page.evaluate(() => (document.body.innerText || '').slice(0, 1500));
  log('UI:', ui.slice(0, 200).replace(/\n/g, ' | '));

  try {
    const ready = page.getByRole('button', { name: /ready|play/i }).first();
    if (await ready.isVisible({ timeout: 1500 }).catch(() => false)) await ready.click();
  } catch {}

  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    try {
      const b = page.getByRole('button', { name: map, exact: true }).first();
      if (await b.isVisible({ timeout: 500 }).catch(() => false)) {
        await b.click();
        await page.waitForTimeout(2000);
      }
    } catch {}
  }

  // explore + panels
  for (const t of [/gallery/i, /shop/i, /guild/i, /achievement/i]) {
    try {
      const b = page.getByRole('button', { name: t }).first();
      if (await b.isVisible({ timeout: 400 }).catch(() => false)) {
        await b.click();
        await page.waitForTimeout(1000);
        await page.keyboard.press('Escape');
      }
    } catch {}
  }
  for (const k of ['KeyZ', 'KeyX', 'KeyC', 'KeyM']) {
    await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape').catch(() => {});
  }
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(400 + Math.sin(i / 3) * 220, 300 + Math.cos(i / 4) * 150);
    if (i % 5 === 0) await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(50);
    try {
      const c = page.getByRole('button', { name: /continue/i }).first();
      if (await c.isVisible({ timeout: 50 }).catch(() => false)) await c.click();
    } catch {}
  }

  // Prefetch full asset manifest
  log('Prefetch assets/manifest.json…');
  const force = await page.evaluate(async () => {
    const man = await (await fetch('/assets/manifest.json')).json();
    const srcs = [...new Set(Object.values(man).map((v) => v && v.src).filter(Boolean))];
    let ok = 0,
      fail = 0;
    for (let i = 0; i < srcs.length; i += 16) {
      const batch = srcs.slice(i, i + 16);
      await Promise.all(
        batch.map(async (src) => {
          try {
            const r = await fetch(src);
            if (r.ok) {
              await r.arrayBuffer();
              ok++;
            } else fail++;
          } catch {
            fail++;
          }
        })
      );
    }
    return { total: srcs.length, ok, fail, srcs };
  });
  log('manifest prefetch', force.total, 'ok', force.ok, 'fail', force.fail);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(OUT, 'reports', 'screenshot.png'), fullPage: true });
  const finalUi = await page.evaluate(() => (document.body.innerText || '').slice(0, 2000));

  await browser.close();

  // Also HTTP-download any manifest src still missing comparison
  const manRes = await fetchBuf(ORIGIN + '/assets/manifest.json');
  if (manRes.status === 200) {
    await saveBody(ORIGIN + '/assets/manifest.json', manRes.body, 'application/json', 200);
    const man = JSON.parse(manRes.body.toString('utf8'));
    const srcs = [...new Set(Object.values(man).map((v) => v && v.src).filter(Boolean))].map((s) =>
      s.startsWith('http') ? s : ORIGIN + s
    );
    const missing = srcs.filter((u) => !seen.has(u));
    log('HTTP fill missing manifest assets', missing.length);
    await mapPool(missing, 10, async (url) => {
      try {
        const r = await fetchBuf(url);
        if (r.status === 200) await saveBody(url, r.body, r.headers['content-type'] || '', 200);
      } catch {}
    });
  }

  const list = [...seen.values()];
  const updated = list.filter((r) => r.change === 'updated');
  const neu = list.filter((r) => r.change === 'new');
  const unchanged = list.filter((r) => r.change === 'unchanged');

  const report = {
    target: ORIGIN,
    capturedAt: new Date().toISOString(),
    user: PASS ? USER : 'guest',
    loginUi: redact(finalUi).slice(0, 800),
    totals: {
      observed: list.length,
      new: neu.length,
      updated: updated.length,
      unchanged: unchanged.length,
      bytes: list.reduce((a, b) => a + b.size, 0),
    },
    ws: wsSessions,
    updatedFiles: updated.map((r) => ({ url: r.url, size: r.size, sha256: r.sha256, prevHash: r.prevHash })),
    newFilesSample: neu.slice(0, 80).map((r) => ({ url: r.url, size: r.size, sha256: r.sha256 })),
    keyBundles: list
      .filter((r) => /page-|framework-|index-|manifest\.json|_next\/static/.test(r.url))
      .map((r) => ({ url: r.url, change: r.change, size: r.size, sha256: r.sha256 })),
  };

  fs.writeFileSync(path.join(OUT, 'reports', 'update-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'network', 'network-log.json'), JSON.stringify(networkLog, null, 2));
  fs.writeFileSync(path.join(OUT, 'websocket', 'session-metadata.json'), JSON.stringify(wsSessions, null, 2));
  fs.writeFileSync(path.join(OUT, 'reports', 'resources.json'), JSON.stringify(list, null, 2));

  const md = [
    '# Online update capture',
    '',
    `Target: ${ORIGIN}/`,
    `Account: ${PASS ? USER : 'guest'}`,
    `Time: ${report.capturedAt}`,
    '',
    `Observed: **${list.length}** | New: **${neu.length}** | Updated: **${updated.length}** | Unchanged: **${unchanged.length}**`,
    '',
    '## Key bundles',
    '',
    ...report.keyBundles.map((k) => `- \`${k.change}\` ${k.url} (${k.size} bytes)`),
    '',
    '## Updated files',
    '',
    ...(updated.length
      ? updated.map((u) => `- ${u.url} — ${u.size} bytes — sha ${u.sha256.slice(0, 16)}…`)
      : ['_none_']),
    '',
    '## WebSocket',
    '',
    wsSessions.length
      ? wsSessions.map((s) => `- ${s.url} frames=${s.frames} in=${s.bytesIn} out=${s.bytesOut}`).join('\n')
      : '_none_',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'reports', 'update-summary.md'), md);

  console.log(
    JSON.stringify(
      {
        observed: list.length,
        new: neu.length,
        updated: updated.length,
        unchanged: unchanged.length,
        ws: wsSessions.length,
        keyBundles: report.keyBundles,
        out: OUT,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(redact(e.stack || e));
  process.exit(1);
});
