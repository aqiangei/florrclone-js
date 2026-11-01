/**
 * Continue online archive: login then capture multiplayer client resources.
 * Credentials from env only — never written to reports.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const USER = process.env.GAME_USER || '';
const PASS = process.env.GAME_PASS || '';
const OUT = path.resolve(__dirname, 'online-game-archive');
const PROFILE = path.resolve(__dirname, 'online-game-profile-login');

if (!PASS) {
  console.error('Set GAME_PASS env var');
  process.exit(1);
}

const LOG = [];
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  LOG.push(line.replace(PASS, '[REDACTED]'));
  console.log(line.replace(PASS, '[REDACTED]'));
}

for (const d of [
  'html','js','css','wasm','workers','maps','configs','images','audio','video','fonts',
  'binary','packages','manifests','inline','blob','data-url','cache-storage','indexeddb',
  'local-storage','session-storage','opfs','websocket','network','metadata','logs','reports',
]) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
}
fs.mkdirSync(PROFILE, { recursive: true });

const resources = new Map();
const networkEntries = [];
const wsSessions = [];
const errors = [];
let seq = 0;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function redactUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/token|auth|key|session|password|secret|cookie|jwt|sid/i.test(k)) url.searchParams.set(k, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return String(u);
  }
}
function redactHeaders(h) {
  const o = {};
  for (const [k, v] of Object.entries(h || {})) {
    o[k] = /authorization|cookie|set-cookie|token|api-key|x-auth/i.test(k) ? '[REDACTED]' : v;
  }
  return o;
}
function classify(url, contentType, resourceType) {
  const u = (url || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (u.startsWith('blob:')) return 'blob';
  if (u.startsWith('data:')) return 'data-url';
  if (u.includes('worker') || resourceType === 'worker') return 'workers';
  if (u.endsWith('.wasm') || ct.includes('wasm')) return 'wasm';
  if (u.endsWith('.css') || ct.includes('text/css') || resourceType === 'stylesheet') return 'css';
  if (u.endsWith('.js') || u.endsWith('.mjs') || ct.includes('javascript')) return 'js';
  if (u.includes('manifest') || u.endsWith('.webmanifest')) return 'manifests';
  if (u.endsWith('.json') || ct.includes('json')) return /map|world|biome|tile/i.test(u) ? 'maps' : 'configs';
  if (u.endsWith('.html') || ct.includes('text/html') || resourceType === 'document') return 'html';
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)(\?|$)/i.test(u) || ct.startsWith('image/') || resourceType === 'image') return 'images';
  if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(u) || ct.startsWith('audio/')) return 'audio';
  if (/\.(mp4|webm)(\?|$)/i.test(u) || ct.startsWith('video/')) return 'video';
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || ct.startsWith('font/') || resourceType === 'font') return 'fonts';
  if (/\.(zip|pak|bundle|bin|dat|pack)(\?|$)/i.test(u)) return 'packages';
  return 'binary';
}
function mimeExt(ct) {
  const map = {
    'text/html': '.html', 'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js',
    'application/json': '.json', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg',
    'image/webp': '.webp', 'font/ttf': '.ttf', 'application/wasm': '.wasm',
  };
  return map[(ct || '').split(';')[0].trim()] || '';
}
function safeBase(urlStr, fallbackExt) {
  try {
    if (urlStr.startsWith('data:')) return `data_${seq}${fallbackExt || '.bin'}`;
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

function loadExisting() {
  const p = path.join(OUT, 'metadata', 'resources.json');
  if (!fs.existsSync(p)) return;
  try {
    const list = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const r of list) {
      if (r.sha256 && r.url) resources.set(`${r.url}#${r.sha256}`, r);
      if (r.id) resources.set(r.id, r);
      if (typeof r.id === 'string' && r.id.startsWith('r_')) {
        const n = Number(r.id.slice(2));
        if (n > seq) seq = n;
      }
    }
    log(`Loaded existing resources index, seq=${seq}`);
  } catch (e) {
    log('Could not load existing resources.json', e.message);
  }
}

function newMeta(partial) {
  const id = `r_${String(++seq).padStart(6, '0')}`;
  return {
    id, url: '', finalUrl: '', requestType: 'GET', httpStatus: 0, contentType: '',
    localPath: null, size: 0, sha256: null, fetchedAt: new Date().toISOString(),
    sourcePage: TARGET, archived: false, failReason: null, etag: null, lastModified: null,
    cacheControl: null, fromCache: false, resourceType: null, ...partial,
  };
}

async function archiveBody(meta, body) {
  if (!body || !body.length) {
    meta.archived = false;
    meta.failReason = 'empty body';
    resources.set(meta.id, meta);
    return meta;
  }
  const hash = sha256(body);
  meta.sha256 = hash;
  meta.size = body.length;
  const dedupeKey = `${meta.url}#${hash}`;
  if (resources.has(dedupeKey) && resources.get(dedupeKey).archived) {
    meta.archived = true;
    meta.localPath = resources.get(dedupeKey).localPath;
    meta.deduped = true;
    resources.set(meta.id, meta);
    return meta;
  }
  const folder = classify(meta.url, meta.contentType, meta.resourceType);
  let ext = path.extname(safeBase(meta.url, '')) || mimeExt(meta.contentType) || '';
  if (folder === 'js' && !ext) ext = '.js';
  const localPath = uniquePath(path.join(OUT, folder), safeBase(meta.url, ext));
  fs.writeFileSync(localPath, body);
  meta.localPath = path.relative(OUT, localPath).replace(/\\/g, '/');
  meta.folder = folder;
  meta.archived = true;
  resources.set(dedupeKey, meta);
  resources.set(meta.id, meta);
  return meta;
}

async function saveResponse(response) {
  const req = response.request();
  const url = response.url();
  if (url.startsWith('blob:')) return;
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
    resourceType: req.resourceType(),
    headers: redactHeaders(headers),
    phase: 'online-login',
  });
  networkEntries.push({
    time: meta.fetchedAt,
    method: meta.requestType,
    url: meta.url,
    status: meta.httpStatus,
    resourceType: meta.resourceType,
    contentType: meta.contentType,
  });

  if (url.startsWith('data:')) {
    try {
      const comma = url.indexOf(',');
      const header = url.slice(0, comma);
      const data = url.slice(comma + 1);
      const isB64 = /;base64/i.test(header);
      const body = isB64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data));
      meta.contentType = (header.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
      await archiveBody(meta, body);
    } catch (e) {
      meta.failReason = e.message;
      resources.set(meta.id, meta);
    }
    return;
  }

  if (meta.httpStatus < 200 || meta.httpStatus >= 400) {
    meta.failReason = `HTTP ${meta.httpStatus}`;
    resources.set(meta.id, meta);
    return;
  }
  try {
    await archiveBody(meta, await response.body());
  } catch (e) {
    meta.failReason = e.message;
    resources.set(meta.id, meta);
  }
}

function attachWs(page) {
  page.on('websocket', (ws) => {
    const session = {
      url: redactUrl(ws.url()),
      connectedAt: new Date().toISOString(),
      closedAt: null,
      messages: [],
      frames: 0,
      bytesIn: 0,
      bytesOut: 0,
    };
    wsSessions.push(session);
    log('WebSocket open', session.url);
    ws.on('framereceived', (ev) => {
      const payload = ev.payload;
      const isBuf = typeof payload !== 'string';
      const size = isBuf ? payload.length : Buffer.byteLength(payload);
      session.frames++;
      session.bytesIn += size;
      session.messages.push({
        dir: 'in', t: new Date().toISOString(), type: isBuf ? 'binary' : 'text', size,
        sha256: sha256(isBuf ? Buffer.from(payload) : Buffer.from(payload, 'utf8')),
        contentSaved: false, note: 'payload omitted',
      });
    });
    ws.on('framesent', (ev) => {
      const payload = ev.payload;
      const isBuf = typeof payload !== 'string';
      const size = isBuf ? payload.length : Buffer.byteLength(payload);
      session.frames++;
      session.bytesOut += size;
      session.messages.push({
        dir: 'out', t: new Date().toISOString(), type: isBuf ? 'binary' : 'text', size,
        sha256: sha256(isBuf ? Buffer.from(payload) : Buffer.from(payload, 'utf8')),
        contentSaved: false, note: 'payload omitted',
      });
    });
    ws.on('close', () => {
      session.closedAt = new Date().toISOString();
      log('WebSocket close', session.url, 'frames', session.frames);
    });
  });
}

async function loginAndPlay(page) {
  const steps = [];

  // Open Account
  const acc = page.getByRole('button', { name: /account|profile/i }).first();
  await acc.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  steps.push('opened-account');

  // Prefer "Log in" tab if present
  try {
    const loginTab = page.getByText(/^Log in$/i).first();
    if (await loginTab.isVisible().catch(() => false)) {
      await loginTab.click();
      await page.waitForTimeout(500);
      steps.push('login-tab');
    }
  } catch {}

  // Fill username/password — try labels and placeholders
  const userField = page.getByPlaceholder(/username|user|email|账号|用户/i).first()
    .or(page.getByLabel(/username|user|email|账号|用户/i).first());
  const passField = page.getByPlaceholder(/password|密码/i).first()
    .or(page.getByLabel(/password|密码/i).first());

  // Fallback: visible password input
  let userOk = false;
  let passOk = false;
  try {
    if (await userField.count()) {
      await userField.fill(USER);
      userOk = true;
    }
  } catch {}
  try {
    if (await passField.count()) {
      await passField.fill(PASS);
      passOk = true;
    }
  } catch {}

  if (!userOk || !passOk) {
    const filled = await page.evaluate(({ user, pass }) => {
      const inputs = [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null || i.type === 'password');
      let u = false, p = false;
      for (const inp of inputs) {
        const t = (inp.type || '').toLowerCase();
        const ph = (inp.placeholder || '' + inp.name || '' + inp.ariaLabel || '').toLowerCase();
        if (!p && (t === 'password' || /pass|密码/.test(ph))) {
          inp.focus();
          inp.value = pass;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          p = true;
        } else if (!u && t !== 'password' && t !== 'hidden' && t !== 'checkbox') {
          // nickname field on lobby is also text — prefer account modal inputs
          const inModal = !!(inp.closest('.modal, .dialog, [class*=account], [class*=login], aside, dialog'));
          if (inModal || /user|name|email|账号/.test(ph) || inputs.filter(x => x.type === 'password').length) {
            // if there's a password nearby, treat other text as username
            inp.focus();
            inp.value = user;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            u = true;
          }
        }
      }
      // second pass: first non-password text in document order near password
      if (!u || !p) {
        const pw = inputs.find((i) => i.type === 'password');
        if (pw) {
          pw.value = pass;
          pw.dispatchEvent(new Event('input', { bubbles: true }));
          p = true;
          const texts = inputs.filter((i) => i.type !== 'password' && i.type !== 'hidden' && i.type !== 'checkbox' && i.type !== 'submit');
          // pick the text input closest before password
          const idx = inputs.indexOf(pw);
          for (let i = idx - 1; i >= 0; i--) {
            if (texts.includes(inputs[i])) {
              inputs[i].value = user;
              inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
              u = true;
              break;
            }
          }
          if (!u && texts[0]) {
            texts[0].value = user;
            texts[0].dispatchEvent(new Event('input', { bubbles: true }));
            u = true;
          }
        }
      }
      return { u, p, inputCount: inputs.length };
    }, { user: USER, pass: PASS });
    steps.push({ evaluateFill: filled });
    userOk = filled.u;
    passOk = filled.p;
  } else {
    steps.push({ playwrightFill: true });
  }

  // Click Log in & play / Log in
  let clicked = false;
  for (const re of [/log in & play/i, /log in and play/i, /^log in$/i, /登录/, /sign in/i]) {
    try {
      const btn = page.getByRole('button', { name: re }).first();
      if ((await btn.count()) && (await btn.isVisible().catch(() => false))) {
        await btn.click({ timeout: 3000 });
        clicked = true;
        steps.push({ clickedLogin: String(re) });
        break;
      }
    } catch {}
  }
  if (!clicked) {
    try {
      await page.getByText(/log in & play/i).first().click({ timeout: 3000 });
      clicked = true;
      steps.push({ clickedLoginText: true });
    } catch {}
  }

  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => (document.body.innerText || '').slice(0, 2500));
  // Redact nothing of password in UI usually; strip username display carefully in logs
  steps.push({ afterLoginUi: after.replace(new RegExp(PASS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]').slice(0, 1500) });

  const loggedIn = /log out|sign out|logged in|welcome|server save|online/i.test(after) && !/log in & play/i.test(after);
  const stillLogin = /log in & play|password|register/i.test(after);
  steps.push({ loggedInGuess: loggedIn, stillLoginForm: stillLogin });

  // Ready / play
  try {
    const ready = page.getByRole('button', { name: /ready|play/i }).first();
    if (await ready.count()) {
      await ready.click({ timeout: 3000 }).catch(() => {});
      steps.push('clicked-ready');
      await page.waitForTimeout(4000);
    }
  } catch {}

  // Biomes + gameplay to trigger online assets / WS traffic
  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    try {
      const btn = page.getByRole('button', { name: map, exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 1500 });
        await page.waitForTimeout(3000);
        steps.push({ biome: map });
      }
    } catch {}
  }

  await page.mouse.move(640, 360);
  for (let i = 0; i < 50; i++) {
    await page.mouse.move(400 + Math.sin(i / 3) * 220, 300 + Math.cos(i / 4) * 160);
    if (i % 5 === 0) await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(60);
  }
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'KeyM', 'Escape']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(250);
  }

  // Open guild/shop/gallery (may be online-related)
  for (const t of [/shop/i, /guild/i, /gallery/i, /achievement/i, /settings/i]) {
    try {
      const b = page.getByRole('button', { name: t }).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(1000);
        await page.keyboard.press('Escape').catch(() => {});
        steps.push({ opened: String(t) });
      }
    } catch {}
  }

  await page.waitForTimeout(8000);
  return steps;
}

function listAll() {
  return [...resources.values()].filter((r) => r && typeof r.id === 'string' && r.id.startsWith('r_'));
}

function writeOutputs(run) {
  // merge network
  const netPath = path.join(OUT, 'network', 'network-log.json');
  let prevNet = [];
  if (fs.existsSync(netPath)) {
    try { prevNet = JSON.parse(fs.readFileSync(netPath, 'utf8')); } catch {}
  }
  const allNet = prevNet.concat(networkEntries);
  fs.writeFileSync(netPath, JSON.stringify(allNet, null, 2));

  const har = {
    log: {
      version: '1.2',
      creator: { name: 'capture-online-login', version: '1.0' },
      pages: [{ startedDateTime: new Date().toISOString(), id: 'page_1', title: TARGET }],
      entries: allNet.map((e) => ({
        startedDateTime: e.time,
        request: { method: e.method, url: e.url, headers: [] },
        response: { status: e.status, content: { mimeType: e.contentType || '', size: -1 }, headers: [] },
      })),
    },
  };
  fs.writeFileSync(path.join(OUT, 'network', 'session.har'), JSON.stringify(har, null, 2));

  // merge ws
  const wsPath = path.join(OUT, 'websocket', 'session-metadata.json');
  let prevWs = { sessions: [] };
  if (fs.existsSync(wsPath)) {
    try { prevWs = JSON.parse(fs.readFileSync(wsPath, 'utf8')); } catch {}
  }
  const mergedWs = {
    note: 'Payloads omitted; metadata and hashes only. Credentials never stored.',
    sessions: [...(prevWs.sessions || []), ...wsSessions.map((s) => ({
      url: s.url,
      connectedAt: s.connectedAt,
      closedAt: s.closedAt,
      frames: s.frames,
      bytesIn: s.bytesIn,
      bytesOut: s.bytesOut,
      messageCount: s.messages.length,
      messages: s.messages,
    }))],
  };
  fs.writeFileSync(wsPath, JSON.stringify(mergedWs, null, 2));

  const list = listAll();
  // unique by id
  const byId = new Map();
  for (const r of list) byId.set(r.id, r);
  const uniq = [...byId.values()];
  fs.writeFileSync(path.join(OUT, 'metadata', 'resources.json'), JSON.stringify(uniq, null, 2));

  const byUrl = {};
  for (const r of uniq) {
    if (!r.url) continue;
    byUrl[r.url] = byUrl[r.url] || [];
    byUrl[r.url].push({ id: r.id, localPath: r.localPath, sha256: r.sha256, size: r.size, archived: r.archived });
  }
  fs.writeFileSync(path.join(OUT, 'metadata', 'url-map.json'), JSON.stringify(byUrl, null, 2));

  const archived = uniq.filter((r) => r.archived && r.sha256 && r.localPath);
  fs.writeFileSync(
    path.join(OUT, 'metadata', 'checksums.sha256'),
    archived.map((r) => `${r.sha256}  ${r.localPath}`).join('\n') + '\n'
  );

  fs.writeFileSync(path.join(OUT, 'reports', 'run-meta-login.json'), JSON.stringify(run, null, 2));
  fs.appendFileSync(path.join(OUT, 'logs', 'download.log'), LOG.join('\n') + '\n');

  return uniq;
}

function verifyChecksums() {
  const lines = fs.readFileSync(path.join(OUT, 'metadata', 'checksums.sha256'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
  let ok = 0, bad = 0;
  const badList = [];
  for (const line of lines) {
    const m = /^([a-f0-9]{64})\s+(.+)$/i.exec(line);
    if (!m) continue;
    const file = path.join(OUT, m[2]);
    if (!fs.existsSync(file)) { bad++; badList.push({ path: m[2], reason: 'missing' }); continue; }
    if (sha256(fs.readFileSync(file)) === m[1].toLowerCase()) ok++;
    else { bad++; badList.push({ path: m[2], reason: 'mismatch' }); }
  }
  return { ok, bad, badList };
}

function zipArchive() {
  const zipPath = path.resolve(__dirname, 'online-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  // tar via powershell may hit path limits; use Compress-Archive on folder
  execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${OUT}' -DestinationPath '${zipPath}' -Force`,
  ], { stdio: 'inherit' });
  const listing = execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `(Add-Type -AssemblyName System.IO.Compression.FileSystem); [IO.Compression.ZipFile]::OpenRead('${zipPath}').Entries.Count`,
  ], { encoding: 'utf8' }).trim();
  return { zipPath, entryCount: Number(listing) || listing, bytes: fs.statSync(zipPath).size };
}

(async () => {
  loadExisting();
  log('Launching browser for online login capture…');
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    args: ['--ignore-certificate-errors'],
  });
  const page = context.pages()[0] || (await context.newPage());
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');

  page.on('response', (r) => saveResponse(r).catch((e) => errors.push({ stage: 'save', error: e.message })));
  page.on('pageerror', (e) => errors.push({ stage: 'pageerror', error: String(e).replace(PASS, '[REDACTED]') }));
  attachWs(page);

  const run = {
    target: TARGET,
    startedAt: new Date().toISOString(),
    accountAttempted: true,
    username: USER,
    passwordStored: false,
    steps: [],
    wsCount: 0,
  };

  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(() =>
      page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 })
    );
    await page.waitForTimeout(3000);
    try { await page.getByText(/Ready/i).waitFor({ timeout: 30000 }); } catch {}

    log('Logging in…');
    run.steps = await loginAndPlay(page);
    run.wsCount = wsSessions.length;
    run.wsUrls = wsSessions.map((s) => s.url);

    await page.screenshot({ path: path.join(OUT, 'reports', 'screenshot-logged-in.png'), fullPage: true });

    // storage dump (redact secrets)
    const storage = await page.evaluate(() => {
      const out = { localStorage: {}, sessionStorage: {} };
      const redact = (k) => /token|password|secret|auth|credential|session|cookie|jwt/i.test(k);
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out.localStorage[k] = redact(k) ? '[REDACTED]' : localStorage.getItem(k);
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        out.sessionStorage[k] = redact(k) ? '[REDACTED]' : sessionStorage.getItem(k);
      }
      return out;
    });
    fs.writeFileSync(path.join(OUT, 'local-storage', 'localStorage-login.json'), JSON.stringify(storage.localStorage, null, 2));
    fs.writeFileSync(path.join(OUT, 'session-storage', 'sessionStorage-login.json'), JSON.stringify(storage.sessionStorage, null, 2));

    await page.waitForTimeout(3000);
    run.finishedAt = new Date().toISOString();
  } catch (e) {
    run.fatal = String(e).replace(PASS, '[REDACTED]');
    log('Fatal', run.fatal);
  } finally {
    await context.close().catch(() => {});
  }

  const uniq = writeOutputs(run);
  const archived = uniq.filter((r) => r.archived);
  const missing = uniq.filter((r) => !r.archived);
  const totalBytes = archived.reduce((a, b) => a + (b.size || 0), 0);
  const byFolder = {};
  for (const r of archived) {
    const f = r.folder || 'unknown';
    byFolder[f] = byFolder[f] || { count: 0, bytes: 0 };
    byFolder[f].count++;
    byFolder[f].bytes += r.size || 0;
  }
  const checksum = verifyChecksums();
  log('Packaging ZIP…');
  const zip = zipArchive();

  const summary = `# Download Summary (login pass)

Target: ${TARGET}
Account login attempted for user \`${USER}\` (password not stored).
WebSocket sessions this pass: **${wsSessions.length}**
WS message metadata: **${wsSessions.reduce((a, s) => a + s.messages.length, 0)}**

## Counts (merged archive)

| Metric | Value |
|--------|------|
| Archived resources | ${archived.length} |
| Missing / failed | ${missing.length} |
| Total bytes | ${totalBytes} (${(totalBytes / 1048576).toFixed(2)} MiB) |
| JS | ${(byFolder.js && byFolder.js.count) || 0} |
| WASM | ${(byFolder.wasm && byFolder.wasm.count) || 0} |
| Workers | ${(byFolder.workers && byFolder.workers.count) || 0} |
| Images | ${(byFolder.images && byFolder.images.count) || 0} |
| Checksums OK/bad | ${checksum.ok}/${checksum.bad} |
| ZIP | \`${zip.zipPath}\` (${zip.entryCount} entries, ${zip.bytes} bytes) |

## Online status

${wsSessions.length ? 'WebSocket activity observed after login — online session likely established.' : 'No WebSocket after login — online multiplayer may still be unavailable, login failed, or uses non-WS transport.'}

Login UI result (excerpt): see \`reports/run-meta-login.json\` (no password).
`;

  fs.writeFileSync(path.join(OUT, 'reports', 'download-summary.md'), summary);
  fs.writeFileSync(path.join(OUT, 'reports', 'final-stats.json'), JSON.stringify({
    archivedCount: archived.length,
    missing: missing.length,
    totalBytes,
    byFolder,
    wsSessions: wsSessions.length,
    wsMessages: wsSessions.reduce((a, s) => a + s.messages.length, 0),
    checksum,
    zip,
    loginUser: USER,
  }, null, 2));

  console.log(JSON.stringify({
    archivedCount: archived.length,
    totalBytes,
    wsSessions: wsSessions.length,
    wsMessages: wsSessions.reduce((a, s) => a + s.messages.length, 0),
    zip,
    loginStepsTail: (run.steps || []).slice(-8),
  }, null, 2));
})().catch((e) => {
  console.error(String(e).replace(PASS, '[REDACTED]'));
  process.exit(1);
});
