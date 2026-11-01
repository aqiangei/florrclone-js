/**
 * Focused online capture after auth — keep WS session alive and archive resources.
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

if (!PASS) {
  console.error('GAME_PASS required');
  process.exit(1);
}

function sha256(b) {
  return crypto.createHash('sha256').update(b).digest('hex');
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
function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a.map((x) => String(x).split(PASS).join('[REDACTED]')));
}

const networkEntries = [];
const wsSessions = [];
const archived = [];

function classify(url, ct, rt) {
  const u = url.toLowerCase();
  const c = (ct || '').toLowerCase();
  if (u.includes('worker') || rt === 'worker') return 'workers';
  if (u.endsWith('.wasm') || c.includes('wasm')) return 'wasm';
  if (u.endsWith('.css') || c.includes('text/css')) return 'css';
  if (u.endsWith('.js') || u.endsWith('.mjs') || c.includes('javascript')) return 'js';
  if (u.includes('manifest')) return 'manifests';
  if (u.endsWith('.json') || c.includes('json')) return 'configs';
  if (c.includes('text/html') || rt === 'document') return 'html';
  if (/\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(u) || c.startsWith('image/')) return 'images';
  if (/\.(mp3|ogg|wav)(\?|$)/i.test(u) || c.startsWith('audio/')) return 'audio';
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || c.startsWith('font/')) return 'fonts';
  return 'binary';
}

async function saveResponse(response) {
  const url = response.url();
  if (url.startsWith('blob:') || url.startsWith('data:')) return;
  const status = response.status();
  const ct = response.headers()['content-type'] || '';
  networkEntries.push({
    t: new Date().toISOString(),
    method: response.request().method(),
    url: redactUrl(url),
    status,
    type: response.request().resourceType(),
    ct,
  });
  if (status < 200 || status >= 400) return;
  try {
    const body = await response.body();
    if (!body.length) return;
    const hash = sha256(body);
    const folder = classify(url, ct, response.request().resourceType());
    let base = 'file';
    try {
      base = path.basename(new URL(url).pathname) || 'file';
    } catch {}
    base = decodeURIComponent(base).replace(/[<>:"|?*]/g, '_');
    if (!path.extname(base)) {
      if (folder === 'js') base += '.js';
      else if (folder === 'configs') base += '.json';
      else if (folder === 'css') base += '.css';
    }
    const dir = path.join(OUT, folder);
    fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, base);
    if (fs.existsSync(dest) && sha256(fs.readFileSync(dest)) === hash) return;
    if (fs.existsSync(dest)) dest = path.join(dir, `${path.parse(base).name}__${hash.slice(0, 8)}${path.parse(base).ext}`);
    fs.writeFileSync(dest, body);
    archived.push({
      url: redactUrl(url),
      localPath: path.relative(OUT, dest).replace(/\\/g, '/'),
      size: body.length,
      sha256: hash,
      folder,
      status,
      ct,
      t: new Date().toISOString(),
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
    const onFrame = (dir) => (ev) => {
      const p = ev.payload;
      const isBuf = typeof p !== 'string';
      const size = isBuf ? p.length : Buffer.byteLength(p);
      s.frames++;
      if (dir === 'in') s.bytesIn += size;
      else s.bytesOut += size;
      // keep metadata only; cap stored rows
      if (s.messages.length < 5000) {
        s.messages.push({
          dir,
          t: new Date().toISOString(),
          type: isBuf ? 'binary' : 'text',
          size,
          sha256: sha256(isBuf ? Buffer.from(p) : Buffer.from(p, 'utf8')),
          contentSaved: false,
        });
      }
    };
    ws.on('framereceived', onFrame('in'));
    ws.on('framesent', onFrame('out'));
    ws.on('close', () => {
      s.closedAt = new Date().toISOString();
      log('WS CLOSE', 'frames', s.frames, 'in', s.bytesIn, 'out', s.bytesOut);
    });
  });
}

async function fillAndSubmit(page, mode) {
  await page.getByRole('button', { name: /account|profile/i }).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);
  if (mode === 'register') {
    try {
      await page.getByText(/^Register$/i).first().click({ timeout: 2000 });
    } catch {}
  } else {
    try {
      await page.getByText(/^Log in$/i).first().click({ timeout: 2000 });
    } catch {}
  }
  await page.waitForTimeout(400);

  const fill = await page.evaluate(({ user, pass, mode }) => {
    const panel =
      [...document.querySelectorAll('div,section,aside,dialog')].find((el) => {
        const t = el.innerText || '';
        return /Password/i.test(t) && /Log in|Register/i.test(t) && t.length < 4000;
      }) || document.body;
    const inputs = [...panel.querySelectorAll('input')].filter((i) => {
      const st = getComputedStyle(i);
      return st.display !== 'none' && i.type !== 'hidden';
    });
    const pws = inputs.filter((i) => i.type === 'password');
    const texts = inputs.filter((i) => i.type !== 'password' && i.type !== 'checkbox');
    const set = (el, val) => {
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      proto.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (!pws[0] || !texts[0]) return { ok: false, inputs: inputs.length };
    set(texts[0], user);
    set(pws[0], pass);
    if (mode === 'register' && pws[1]) set(pws[1], pass);
    return { ok: true, texts: texts.length, pws: pws.length };
  }, { user: USER, pass: PASS, mode });

  const btnRe = mode === 'register' ? /register/i : /log in & play|log in/i;
  try {
    await page.getByRole('button', { name: btnRe }).last().click({ timeout: 4000 });
  } catch {
    await page.getByText(mode === 'register' ? /register/i : /log in & play/i).last().click({ timeout: 4000 }).catch(() => {});
  }
  return fill;
}

async function dismissDeath(page) {
  for (const re of [/continue/i, /respawn/i, /play again/i, /close/i]) {
    try {
      const b = page.getByRole('button', { name: re }).first();
      if (await b.isVisible({ timeout: 500 }).catch(() => false)) {
        await b.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch {}
  }
}

(async () => {
  for (const d of ['configs', 'js', 'images', 'websocket', 'network', 'reports', 'metadata', 'logs']) {
    fs.mkdirSync(path.join(OUT, d), { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await (await context.newCDPSession(page)).send('Network.enable');
  page.on('response', (r) => saveResponse(r).catch(() => {}));
  attachWs(page);

  const run = { startedAt: new Date().toISOString(), user: USER, steps: [] };

  log('Goto', TARGET);
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(() =>
    page.goto(TARGET, { waitUntil: 'domcontentloaded' })
  );
  await page.waitForTimeout(3000);
  try {
    await page.getByText(/Ready/i).waitFor({ timeout: 25000 });
  } catch {}

  log('Login');
  run.steps.push({ loginFill: await fillAndSubmit(page, 'login') });
  await page.waitForTimeout(4000);
  let ui = await page.evaluate(() => (document.body.innerText || '').slice(0, 2000));
  run.steps.push({ afterLogin: ui.split(PASS).join('[REDACTED]').slice(0, 1000) });
  log('UI:', ui.slice(0, 180).replace(/\n/g, ' | '));

  if (/Incorrect username or password/i.test(ui)) {
    log('Login rejected — trying Register');
    try {
      await page.keyboard.press('Escape');
    } catch {}
    await page.waitForTimeout(500);
    // reopen if needed
    if (!(await page.getByText(/Password/i).first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /account|profile/i }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    run.steps.push({ regFill: await fillAndSubmit(page, 'register') });
    await page.waitForTimeout(5000);
    ui = await page.evaluate(() => (document.body.innerText || '').slice(0, 2000));
    run.steps.push({ afterRegister: ui.split(PASS).join('[REDACTED]').slice(0, 1000) });
    log('After reg:', ui.slice(0, 180).replace(/\n/g, ' | '));

    if (/already|taken|exists|incorrect/i.test(ui)) {
      log('Register conflict — login once more');
      try {
        await page.getByText(/^Log in$/i).first().click({ timeout: 2000 });
      } catch {}
      await fillAndSubmit(page, 'login');
      await page.waitForTimeout(4000);
      ui = await page.evaluate(() => (document.body.innerText || '').slice(0, 2000));
      run.steps.push({ afterLogin2: ui.split(PASS).join('[REDACTED]').slice(0, 1000) });
    }
  }

  // Enter play if still in lobby
  try {
    const ready = page.getByRole('button', { name: /ready|play/i }).first();
    if (await ready.isVisible({ timeout: 1500 }).catch(() => false)) {
      await ready.click();
      run.steps.push('ready');
      await page.waitForTimeout(3000);
    }
  } catch {}

  await dismissDeath(page);

  // Explore online for ~45s
  log('Online explore… WS=', wsSessions.length);
  const biomes = ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel'];
  const t0 = Date.now();
  let bi = 0;
  while (Date.now() - t0 < 45000) {
    await dismissDeath(page);
    try {
      const map = biomes[bi % biomes.length];
      const b = page.getByRole('button', { name: map, exact: true }).first();
      if (await b.isVisible({ timeout: 300 }).catch(() => false)) await b.click({ timeout: 800 }).catch(() => {});
      bi++;
    } catch {}
    for (let i = 0; i < 15; i++) {
      await page.mouse.move(400 + Math.sin((Date.now() / 200 + i) ) * 250, 320 + Math.cos(Date.now() / 300 + i) * 150);
      if (i % 4 === 0) await page.keyboard.down('Space');
      if (i % 4 === 2) await page.keyboard.up('Space');
      await page.waitForTimeout(70);
    }
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC']) {
      await page.keyboard.press(k).catch(() => {});
    }
    await page.waitForTimeout(500);
  }

  // Open online-ish panels
  for (const t of [/guild/i, /shop/i, /gallery/i, /achievement/i]) {
    try {
      const b = page.getByRole('button', { name: t }).first();
      if (await b.isVisible({ timeout: 400 }).catch(() => false)) {
        await b.click({ timeout: 1000 });
        await page.waitForTimeout(1200);
        await page.keyboard.press('Escape');
      }
    } catch {}
  }

  await page.waitForTimeout(3000);
  const finalUi = await page.evaluate(() => (document.body.innerText || '').slice(0, 2500));
  run.finalUi = finalUi.split(PASS).join('[REDACTED]');
  run.ws = wsSessions.map((s) => ({
    url: s.url,
    frames: s.frames,
    bytesIn: s.bytesIn,
    bytesOut: s.bytesOut,
    messageCount: s.messages.length,
    closedAt: s.closedAt,
  }));
  run.archivedNew = archived.length;
  run.finishedAt = new Date().toISOString();

  await page.screenshot({ path: path.join(OUT, 'reports', 'screenshot-online-ws.png'), fullPage: true });

  // storage
  const storage = await page.evaluate(() => {
    const out = { localStorage: {}, sessionStorage: {} };
    const red = (k) => /token|password|secret|auth|credential|session|cookie|jwt/i.test(k);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out.localStorage[k] = red(k) ? '[REDACTED]' : localStorage.getItem(k);
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      out.sessionStorage[k] = red(k) ? '[REDACTED]' : sessionStorage.getItem(k);
    }
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'local-storage', 'localStorage-online.json'), JSON.stringify(storage.localStorage, null, 2));

  await context.close();
  await browser.close();

  // Merge outputs
  fs.writeFileSync(path.join(OUT, 'network', 'network-log-online.json'), JSON.stringify(networkEntries, null, 2));
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'capture-online-ws', version: '1.0' },
      entries: networkEntries.map((e) => ({
        startedDateTime: e.t,
        request: { method: e.method, url: e.url, headers: [] },
        response: { status: e.status, content: { mimeType: e.ct, size: -1 }, headers: [] },
      })),
    },
  };
  fs.writeFileSync(path.join(OUT, 'network', 'session.har'), JSON.stringify(har, null, 2));

  const wsOut = {
    note: 'Payloads omitted. Credentials not stored.',
    sessions: wsSessions.map((s) => ({
      url: s.url,
      connectedAt: s.connectedAt,
      closedAt: s.closedAt,
      frames: s.frames,
      bytesIn: s.bytesIn,
      bytesOut: s.bytesOut,
      messageCount: s.messages.length,
      messages: s.messages,
    })),
  };
  fs.writeFileSync(path.join(OUT, 'websocket', 'session-metadata.json'), JSON.stringify(wsOut, null, 2));

  const metaPath = path.join(OUT, 'metadata', 'resources.json');
  let meta = [];
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}
  }
  let n = meta.length;
  for (const a of archived) {
    n++;
    meta.push({
      id: `r_online_${n}`,
      url: a.url,
      localPath: a.localPath,
      size: a.size,
      sha256: a.sha256,
      contentType: a.ct,
      httpStatus: a.status,
      archived: true,
      folder: a.folder,
      fetchedAt: a.t,
      phase: 'online-ws',
    });
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  const byUrl = {};
  for (const r of meta) {
    if (!r.url) continue;
    byUrl[r.url] = byUrl[r.url] || [];
    byUrl[r.url].push({ id: r.id, localPath: r.localPath, sha256: r.sha256, archived: r.archived });
  }
  fs.writeFileSync(path.join(OUT, 'metadata', 'url-map.json'), JSON.stringify(byUrl, null, 2));

  const checksumLines = meta
    .filter((r) => r.archived && r.sha256 && r.localPath && fs.existsSync(path.join(OUT, r.localPath)))
    .map((r) => `${r.sha256}  ${r.localPath}`);
  fs.writeFileSync(path.join(OUT, 'metadata', 'checksums.sha256'), checksumLines.join('\n') + '\n');

  const diskFiles = [];
  function walk(d, rel = '') {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const r = path.join(rel, name);
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else diskFiles.push({ path: r.replace(/\\/g, '/'), size: fs.statSync(full).size });
    }
  }
  walk(OUT);
  const totalBytes = diskFiles.reduce((a, b) => a + b.size, 0);

  const summary = `# Download Summary

Target: ${TARGET}
User login attempted: \`${USER}\` (password not stored in archive)

## Online session

- WebSocket sessions: **${wsSessions.length}**
- WS URL(s): ${wsSessions.map((s) => s.url).join(', ') || '(none)'}
- WS frames: ${wsSessions.reduce((a, s) => a + s.frames, 0)}
- WS bytes in/out: ${wsSessions.reduce((a, s) => a + s.bytesIn, 0)} / ${wsSessions.reduce((a, s) => a + s.bytesOut, 0)}
- Message metadata rows: ${wsSessions.reduce((a, s) => a + s.messages.length, 0)}

## Archive

- Files on disk: **${diskFiles.length}**
- Total size: **${totalBytes}** bytes (${(totalBytes / 1048576).toFixed(2)} MiB)
- New archived this pass: ${archived.length}
- Metadata records: ${meta.length}
- Checksum lines: ${checksumLines.length}

## Final UI signals

\`\`\`
${run.finalUi.slice(0, 800)}
\`\`\`
`;
  fs.writeFileSync(path.join(OUT, 'reports', 'download-summary.md'), summary);
  fs.writeFileSync(
    path.join(OUT, 'reports', 'missing-resources.md'),
    `# Missing / Not Covered

- Authenticated-only assets not requested by client during this session
- WS message **payloads** intentionally omitted (privacy)
- Path-guessed URLs: not attempted

Auth/UI details: \`reports/run-meta-online-ws.json\`
`
  );
  fs.writeFileSync(
    path.join(OUT, 'reports', 'coverage.md'),
    `# Coverage

- Site load + Account login/register attempts with provided test account
- WebSocket \`/ws\` session while playing biomes (~45s exploration)
- Death Continue / UI panels when visible
- No absolute completeness claim
`
  );
  fs.writeFileSync(path.join(OUT, 'reports', 'run-meta-online-ws.json'), JSON.stringify(run, null, 2));
  fs.appendFileSync(path.join(OUT, 'logs', 'download.log'), summary + '\n');

  const zipPath = path.resolve(__dirname, 'online-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zipPath}' -Force`], {
    stdio: 'inherit',
  });
  const zipBytes = fs.statSync(zipPath).size;
  const zipEntries = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Add-Type -AssemblyName System.IO.Compression.FileSystem); [IO.Compression.ZipFile]::OpenRead('${zipPath}').Entries.Count`,
    ],
    { encoding: 'utf8' }
  ).trim();

  fs.writeFileSync(
    path.join(OUT, 'reports', 'final-stats.json'),
    JSON.stringify(
      {
        diskFiles: diskFiles.length,
        totalBytes,
        wsSessions: wsSessions.length,
        wsFrames: wsSessions.reduce((a, s) => a + s.frames, 0),
        wsMessages: wsSessions.reduce((a, s) => a + s.messages.length, 0),
        archivedNew: archived.length,
        metaRecords: meta.length,
        zipPath,
        zipBytes,
        zipEntries: Number(zipEntries) || zipEntries,
        user: USER,
      },
      null,
      2
    )
  );

  // also copy zip note into summary
  fs.appendFileSync(path.join(OUT, 'reports', 'download-summary.md'), `\n## ZIP\n\n\`${zipPath}\`\nEntries: ${zipEntries}\nBytes: ${zipBytes}\n`);

  console.log(
    JSON.stringify(
      {
        diskFiles: diskFiles.length,
        totalBytes,
        wsSessions: wsSessions.length,
        wsFrames: wsSessions.reduce((a, s) => a + s.frames, 0),
        wsMessages: wsSessions.reduce((a, s) => a + s.messages.length, 0),
        zipPath,
        zipBytes,
        zipEntries,
        finalUiHead: run.finalUi.slice(0, 250).replace(/\n/g, ' | '),
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(String(e).split(PASS).join('[REDACTED]'));
  process.exit(1);
});
