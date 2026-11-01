/**
 * Retry auth: inspect Account modal, try Login then Register with provided creds.
 * Password never written to disk reports.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const USER = process.env.GAME_USER || '';
const PASS = process.env.GAME_PASS || '';
const OUT = path.resolve(__dirname, 'online-game-archive');
const PROFILE = path.resolve(__dirname, 'online-game-profile-auth2');

if (!PASS) {
  console.error('GAME_PASS required');
  process.exit(1);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function redactUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/token|auth|key|session|password|secret|cookie|jwt/i.test(k)) url.searchParams.set(k, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return String(u);
  }
}

const networkEntries = [];
const wsSessions = [];
const saved = [];
const LOG = [];
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`.replaceAll(PASS, '[REDACTED]');
  LOG.push(line);
  console.log(line);
}

async function saveResponse(response) {
  const url = response.url();
  if (url.startsWith('blob:') || url.startsWith('data:')) return;
  const status = response.status();
  networkEntries.push({
    t: new Date().toISOString(),
    method: response.request().method(),
    url: redactUrl(url),
    status,
    type: response.request().resourceType(),
    ct: response.headers()['content-type'] || '',
  });
  if (status < 200 || status >= 400) return;
  // Save API/json and newly seen static assets
  try {
    const body = await response.body();
    if (!body.length) return;
    const ct = response.headers()['content-type'] || '';
    const u = url.toLowerCase();
    let folder = 'binary';
    if (u.includes('/api/') || ct.includes('json')) folder = 'configs';
    else if (/\.js(\?|$)/.test(u)) folder = 'js';
    else if (/\.css(\?|$)/.test(u)) folder = 'css';
    else if (/\.wasm(\?|$)/.test(u)) folder = 'wasm';
    else if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(u) || ct.startsWith('image/')) folder = 'images';
    else if (/\.(woff2?|ttf)(\?|$)/.test(u)) folder = 'fonts';
    else if (/\.html(\?|$)/.test(u) || ct.includes('text/html')) folder = 'html';
    else if (u.includes('worker')) folder = 'workers';

    const hash = sha256(body);
    let base = 'index';
    try {
      base = path.basename(new URL(url).pathname) || 'index';
    } catch {}
    base = base.replace(/[<>:"|?*]/g, '_');
    if (!path.extname(base)) {
      if (folder === 'configs') base += '.json';
      if (folder === 'js') base += '.js';
    }
    const dir = path.join(OUT, folder);
    fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, base);
    if (fs.existsSync(dest)) {
      // same hash skip
      const existing = fs.readFileSync(dest);
      if (sha256(existing) === hash) {
        saved.push({ url: redactUrl(url), localPath: path.relative(OUT, dest), deduped: true, size: body.length });
        return;
      }
      dest = path.join(dir, `${path.basename(base, path.extname(base))}__${hash.slice(0, 8)}${path.extname(base)}`);
    }
    fs.writeFileSync(dest, body);
    saved.push({
      url: redactUrl(url),
      localPath: path.relative(OUT, dest).replace(/\\/g, '/'),
      size: body.length,
      sha256: hash,
      status,
      ct,
    });
  } catch {}
}

function attachWs(page) {
  page.on('websocket', (ws) => {
    const s = {
      url: redactUrl(ws.url()),
      connectedAt: new Date().toISOString(),
      closedAt: null,
      messages: [],
      frames: 0,
      bytesIn: 0,
      bytesOut: 0,
    };
    wsSessions.push(s);
    log('WS OPEN', s.url);
    ws.on('framereceived', (ev) => {
      const p = ev.payload;
      const isBuf = typeof p !== 'string';
      const size = isBuf ? p.length : Buffer.byteLength(p);
      s.frames++;
      s.bytesIn += size;
      s.messages.push({
        dir: 'in', t: new Date().toISOString(), type: isBuf ? 'binary' : 'text', size,
        sha256: sha256(isBuf ? Buffer.from(p) : Buffer.from(p, 'utf8')), contentSaved: false,
      });
    });
    ws.on('framesent', (ev) => {
      const p = ev.payload;
      const isBuf = typeof p !== 'string';
      const size = isBuf ? p.length : Buffer.byteLength(p);
      s.frames++;
      s.bytesOut += size;
      s.messages.push({
        dir: 'out', t: new Date().toISOString(), type: isBuf ? 'binary' : 'text', size,
        sha256: sha256(isBuf ? Buffer.from(p) : Buffer.from(p, 'utf8')), contentSaved: false,
      });
    });
    ws.on('close', () => {
      s.closedAt = new Date().toISOString();
      log('WS CLOSE frames=', s.frames);
    });
  });
}

async function openAccount(page) {
  await page.getByRole('button', { name: /account|profile/i }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

async function dumpForm(page) {
  return page.evaluate(() => {
    const modal = [...document.querySelectorAll('div,section,aside,dialog')].find((el) =>
      /Account|Log in|Register|Password/i.test(el.innerText || '') && (el.innerText || '').length < 4000
    );
    const root = modal || document.body;
    return [...root.querySelectorAll('input,button,select,textarea')].map((el) => ({
      tag: el.tagName,
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      aria: el.getAttribute('aria-label') || '',
      text: (el.innerText || el.value || '').slice(0, 60),
      className: String(el.className || '').slice(0, 80),
      disabled: !!el.disabled,
    }));
  });
}

async function fillAuth(page, mode) {
  // mode: 'login' | 'register'
  if (mode === 'register') {
    const reg = page.getByText(/^Register$/i).first();
    if (await reg.isVisible().catch(() => false)) await reg.click();
  } else {
    const login = page.getByText(/^Log in$/i).first();
    if (await login.isVisible().catch(() => false)) await login.click();
  }
  await page.waitForTimeout(600);

  // Use Playwright locator strategy on password + preceding textbox in account panel
  const result = await page.evaluate(({ user, pass, mode }) => {
    const findPanel = () =>
      [...document.querySelectorAll('div,section,aside,dialog')].find((el) => {
        const t = el.innerText || '';
        return /Log in & play|Register|Password/i.test(t) && t.length < 3500;
      }) || document.body;

    const panel = findPanel();
    const inputs = [...panel.querySelectorAll('input')].filter((i) => {
      const st = getComputedStyle(i);
      return st.display !== 'none' && st.visibility !== 'hidden' && i.type !== 'hidden';
    });

    const pw = inputs.find((i) => i.type === 'password');
    if (!pw) return { ok: false, reason: 'no-password', inputTypes: inputs.map((i) => i.type) };

    // username: text/email inputs in panel excluding nickname on main lobby
    const texts = inputs.filter((i) => i !== pw && (i.type === 'text' || i.type === 'email' || i.type === '' || i.type === 'username'));
    // Prefer input whose label/placeholder mentions user
    let userInput =
      texts.find((i) => /user|email|account|账号/i.test((i.placeholder || '') + (i.name || '') + (i.id || '') + (i.getAttribute('aria-label') || ''))) ||
      texts[texts.length - 1] ||
      texts[0];

    if (!userInput) return { ok: false, reason: 'no-user', count: inputs.length };

    const set = (el, val) => {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      proto.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    };
    set(userInput, user);
    set(pw, pass);

    // confirm password if register
    if (mode === 'register') {
      const pws = inputs.filter((i) => i.type === 'password');
      if (pws[1]) set(pws[1], pass);
    }

    return {
      ok: true,
      userPlaceholder: userInput.placeholder,
      userName: userInput.name,
      userValueLen: userInput.value.length,
      passLen: pw.value.length,
      passwordCount: inputs.filter((i) => i.type === 'password').length,
      mode,
    };
  }, { user: USER, pass: PASS, mode });

  return result;
}

async function clickSubmit(page, mode) {
  const patterns =
    mode === 'register'
      ? [/register & play/i, /create account/i, /^register$/i, /注册/]
      : [/log in & play/i, /log in and play/i, /^log in$/i, /登录/];
  for (const re of patterns) {
    try {
      const btn = page.getByRole('button', { name: re }).first();
      if ((await btn.count()) && (await btn.isVisible().catch(() => false)) && !(await btn.isDisabled().catch(() => true))) {
        await btn.click({ timeout: 3000 });
        return String(re);
      }
    } catch {}
  }
  // text click fallback
  try {
    await page.getByText(mode === 'register' ? /register/i : /log in & play/i).last().click({ timeout: 3000 });
    return 'text-fallback';
  } catch {
    return null;
  }
}

async function uiState(page) {
  const text = await page.evaluate(() => (document.body.innerText || '').slice(0, 3000));
  return text.replaceAll(PASS, '[REDACTED]');
}

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  page.on('response', (r) => saveResponse(r).catch(() => {}));
  attachWs(page);

  const run = { startedAt: new Date().toISOString(), user: USER, steps: [] };

  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(() =>
    page.goto(TARGET, { waitUntil: 'domcontentloaded' })
  );
  await page.waitForTimeout(3000);
  try { await page.getByText(/Ready/i).waitFor({ timeout: 25000 }); } catch {}

  await openAccount(page);
  run.steps.push({ formBefore: await dumpForm(page) });

  // --- LOGIN attempt ---
  log('Try LOGIN');
  const fillLogin = await fillAuth(page, 'login');
  run.steps.push({ fillLogin });
  const clickedLogin = await clickSubmit(page, 'login');
  run.steps.push({ clickedLogin });
  await page.waitForTimeout(5000);
  let state = await uiState(page);
  run.steps.push({ afterLogin: state.slice(0, 1200) });
  log('After login snippet:', state.slice(0, 200).replace(/\n/g, ' | '));

  let success = /incorrect username or password/i.test(state)
    ? false
    : /log out|sign out|logged in|server save loaded|welcome/i.test(state) ||
      (!/log in & play/i.test(state) && !/Incorrect username or password/i.test(state) && /Account/i.test(state));

  // Also treat disappearance of password form error as possible success if Ready stays
  if (/Incorrect username or password/i.test(state)) success = false;

  if (!success) {
    log('LOGIN failed — try REGISTER');
    // reopen account if closed
    try {
      if (!(await page.getByText(/Password/i).first().isVisible().catch(() => false))) {
        await openAccount(page);
      }
    } catch {
      await openAccount(page);
    }
    const fillReg = await fillAuth(page, 'register');
    run.steps.push({ fillReg });
    const clickedReg = await clickSubmit(page, 'register');
    run.steps.push({ clickedReg });
    await page.waitForTimeout(6000);
    state = await uiState(page);
    run.steps.push({ afterRegister: state.slice(0, 1200) });
    log('After register snippet:', state.slice(0, 200).replace(/\n/g, ' | '));
    success = !/incorrect|already|error|failed/i.test(state) && !/log in & play/i.test(state);
    // If register said username taken, try login again carefully
    if (/already|taken|exists/i.test(state)) {
      log('Username may exist — login again');
      try {
        await page.getByText(/^Log in$/i).first().click();
      } catch {}
      await fillAuth(page, 'login');
      await clickSubmit(page, 'login');
      await page.waitForTimeout(5000);
      state = await uiState(page);
      run.steps.push({ afterLogin2: state.slice(0, 1200) });
    }
  }

  // Capture auth-related network (API)
  const authNet = networkEntries.filter((e) =>
    /login|register|auth|account|session|user|api/i.test(e.url) || e.ct.includes('json')
  );
  run.authNetwork = authNet.slice(0, 50);
  run.ws = wsSessions.map((s) => ({ url: s.url, frames: s.frames, bytesIn: s.bytesIn, bytesOut: s.bytesOut }));

  // If looks logged in, play
  try {
    await page.keyboard.press('Escape');
  } catch {}
  try {
    const ready = page.getByRole('button', { name: /ready|play/i }).first();
    if (await ready.isVisible().catch(() => false)) {
      await ready.click();
      await page.waitForTimeout(5000);
      run.steps.push('ready-clicked');
    }
  } catch {}

  for (const map of ['Garden', 'Desert', 'Ocean']) {
    try {
      const b = page.getByRole('button', { name: map, exact: true }).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click();
        await page.waitForTimeout(2500);
      }
    } catch {}
  }
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(500 + i * 5, 350);
    await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(5000);

  await page.screenshot({ path: path.join(OUT, 'reports', 'screenshot-auth-retry.png'), fullPage: true });
  run.finishedAt = new Date().toISOString();
  run.wsFinal = wsSessions.length;
  run.savedNew = saved.length;
  run.finalUi = (await uiState(page)).slice(0, 1500);

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  // Merge into metadata lightly
  const metaPath = path.join(OUT, 'metadata', 'resources.json');
  let meta = [];
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
  }
  let seq = meta.length;
  for (const s of saved) {
    if (s.deduped) continue;
    seq++;
    meta.push({
      id: `r_auth_${seq}`,
      url: s.url,
      localPath: s.localPath,
      size: s.size,
      sha256: s.sha256,
      contentType: s.ct,
      httpStatus: s.status,
      archived: true,
      fetchedAt: new Date().toISOString(),
      phase: 'auth-retry',
    });
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  // append network
  const netPath = path.join(OUT, 'network', 'network-log-auth.json');
  fs.writeFileSync(netPath, JSON.stringify(networkEntries, null, 2));

  const wsPath = path.join(OUT, 'websocket', 'session-metadata.json');
  let prev = { sessions: [] };
  if (fs.existsSync(wsPath)) try { prev = JSON.parse(fs.readFileSync(wsPath, 'utf8')); } catch {}
  prev.sessions = prev.sessions.concat(
    wsSessions.map((s) => ({
      url: s.url,
      connectedAt: s.connectedAt,
      closedAt: s.closedAt,
      frames: s.frames,
      bytesIn: s.bytesIn,
      bytesOut: s.bytesOut,
      messageCount: s.messages.length,
      messages: s.messages,
    }))
  );
  fs.writeFileSync(wsPath, JSON.stringify(prev, null, 2));

  fs.writeFileSync(path.join(OUT, 'reports', 'run-meta-auth-retry.json'), JSON.stringify(run, null, 2));
  fs.appendFileSync(path.join(OUT, 'logs', 'download.log'), LOG.join('\n') + '\n');

  // update missing note
  fs.writeFileSync(
    path.join(OUT, 'reports', 'missing-resources.md'),
    `# Missing / Not Archived

## Online multiplayer

Account UI states: *Online play requires this game's account server.*

Auth retry result (password not stored):
- Login/Register attempts recorded in \`reports/run-meta-auth-retry.json\`
- WebSocket sessions after auth: **${wsSessions.length}**
- Final UI excerpt saved in run meta

${wsSessions.length === 0 ? 'No WebSocket established — online mode resources beyond public client shell were **not** available in this session (auth failed or account server unreachable).' : 'WS observed — see websocket/session-metadata.json'}

## Policy exclusions

- No path fuzzing
- No credential storage in archive
- Other users private data not collected
`
  );

  // zip
  const zipPath = path.resolve(__dirname, 'online-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zipPath}' -Force`], {
    stdio: 'inherit',
  });

  console.log(
    JSON.stringify(
      {
        wsSessions: wsSessions.length,
        savedNew: saved.filter((s) => !s.deduped).length,
        authNetSample: authNet.slice(0, 10),
        finalUi: run.finalUi.slice(0, 400),
        zipPath,
        zipBytes: fs.statSync(zipPath).size,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(String(e).replaceAll(PASS, '[REDACTED]'));
  process.exit(1);
});
