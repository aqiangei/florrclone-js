/**
 * Enter Wave mode via normal UI and capture newly loaded public resources.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const TARGET = process.env.TARGET_URL || 'https://152.32.173.78/';
const OUT = path.resolve(__dirname, 'florr-site-download');
const WAVE = path.join(OUT, 'wave');
const SITE = path.resolve(__dirname, 'florr-local-site');
const DIRS = ['html', 'js', 'wasm', 'workers', 'json', 'assets', 'cache', 'network', 'reports'];

for (const d of [...DIRS.map((x) => path.join(WAVE, x)), WAVE]) {
  fs.mkdirSync(d, { recursive: true });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout: 45000 }, (res) => {
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

function classify(url) {
  const u = url.toLowerCase();
  if (u.includes('worker')) return 'workers';
  if (u.endsWith('.wasm')) return 'wasm';
  if (u.endsWith('.js') || u.endsWith('.mjs')) return 'js';
  if (u.endsWith('.json') || u.endsWith('.webmanifest')) return 'json';
  if (u.endsWith('.html') || u.endsWith('.htm')) return 'html';
  return 'assets';
}

async function saveBody(url, body, contentType, method, bag) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
  if (bag.has(url)) return bag.get(url);
  const folder = classify(url);
  let name;
  try {
    name = path.basename(new URL(url).pathname) || 'file';
  } catch {
    name = 'file_' + bag.size;
  }
  name = name.replace(/[<>:"|?*]/g, '_');
  const dir = path.join(WAVE, folder);
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, name);
  if (fs.existsSync(dest)) {
    const ext = path.extname(name);
    dest = path.join(dir, path.basename(name, ext) + '_' + bag.size + ext);
  }
  fs.writeFileSync(dest, body);

  // Mirror into florr-local-site if same-origin path
  try {
    const u = new URL(url);
    if (u.hostname === '152.32.173.78' || url.startsWith(TARGET.replace(/\/$/, ''))) {
      const sitePath = path.join(SITE, ...u.pathname.split('/').filter(Boolean));
      if (u.pathname !== '/' && u.pathname) {
        fs.mkdirSync(path.dirname(sitePath), { recursive: true });
        if (!fs.existsSync(sitePath)) fs.writeFileSync(sitePath, body);
      }
    }
  } catch {}

  const meta = {
    url,
    localPath: path.relative(OUT, dest).replace(/\\/g, '/'),
    size: body.length,
    sha256: sha256(body),
    contentType: contentType || '',
    downloadedAt: new Date().toISOString(),
    purpose: 'Wave-mode session resource',
    method,
  };
  bag.set(url, meta);
  return meta;
}

(async () => {
  const resources = new Map();
  const networkLog = [];
  const steps = [];
  const errors = [];

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const entry = {
      url,
      status,
      resourceType: response.request().resourceType(),
      contentType: response.headers()['content-type'] || '',
      time: new Date().toISOString(),
    };
    networkLog.push(entry);
    if (status < 200 || status >= 400) return;
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    try {
      const body = await response.body();
      await saveBody(url, body, entry.contentType, 'wave-session-response', resources);
      entry.saved = true;
    } catch (e) {
      entry.error = e.message;
    }
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  console.log('Goto', TARGET);
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page.getByText(/Ready/i).waitFor({ timeout: 45000 });
    steps.push({ ready: true });
  } catch {
    steps.push({ ready: false });
  }
  await page.waitForTimeout(2000);

  // Snapshot lobby UI for Wave / Online / Squad controls
  const lobby = await page.evaluate(() => {
    const texts = [];
    const buttons = [...document.querySelectorAll('button, a, [role="button"], label, input')].map((el) => ({
      tag: el.tagName,
      text: (el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 80),
      aria: el.getAttribute('aria-label') || '',
      title: el.title || '',
      className: String(el.className || '').slice(0, 100),
      type: el.getAttribute('type') || '',
      value: el.value || '',
    }));
    return {
      body: (document.body.innerText || '').slice(0, 2500),
      buttons: buttons.filter((b) => /wave|online|squad|mode|play|ready|adventure|local|guest/i.test(
        b.text + ' ' + b.aria + ' ' + b.title + ' ' + b.className
      )),
      allButtonTexts: buttons.map((b) => b.text || b.aria || b.title).filter(Boolean).slice(0, 80),
    };
  });
  steps.push({ lobby });
  fs.writeFileSync(path.join(WAVE, 'reports', 'lobby-ui.json'), JSON.stringify(lobby, null, 2));

  // Try clicking anything that looks like Wave / Online / Squad / Mode
  async function tryClick(re, label) {
    try {
      const loc = page.getByText(re).first();
      if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
        await loc.click({ timeout: 3000 });
        steps.push({ click: label, ok: true });
        await page.waitForTimeout(1500);
        return true;
      }
    } catch (e) {
      steps.push({ click: label, error: e.message });
    }
    try {
      const loc = page.getByRole('button', { name: re }).first();
      if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
        await loc.click({ timeout: 3000 });
        steps.push({ clickRole: label, ok: true });
        await page.waitForTimeout(1500);
        return true;
      }
    } catch (e) {
      steps.push({ clickRole: label, error: e.message });
    }
    return false;
  }

  await tryClick(/wave/i, 'Wave');
  await tryClick(/online/i, 'Online');
  await tryClick(/squad/i, 'Squad');
  await tryClick(/adventure/i, 'Adventure');

  // Profile / account menus sometimes hide mode toggles
  try {
    const profile = page.locator('button.lobby-menu-profile, [aria-label="Account"], [title="Account"]').first();
    if (await profile.isVisible().catch(() => false)) {
      await profile.click();
      steps.push({ openProfile: true });
      await page.waitForTimeout(1000);
      await tryClick(/wave/i, 'Wave-in-profile');
      await tryClick(/online/i, 'Online-in-profile');
    }
  } catch (e) {
    steps.push({ openProfile: e.message });
  }

  // Inject-eval: call client setWaveMode if engine exposed (research only, local state)
  const waveInject = await page.evaluate(() => {
    const out = { found: false, methods: [] };
    // Search React fiber / globals carefully without inventing APIs
    const keys = Object.keys(window).filter((k) => /wave|engine|game|petal|garden/i.test(k));
    out.windowKeys = keys.slice(0, 40);

    // Look for canvas / engine refs on DOM
    const main = document.querySelector('main.game-shell');
    out.hasShell = !!main;
    out.shellClass = main ? main.className : '';

    // Try clicking UI that contains "Wave" after menus open
    const nodes = [...document.querySelectorAll('*')].filter((el) => {
      const t = (el.innerText || '').trim();
      return t === 'Wave' || t === 'WAVE' || /^Wave\b/.test(t);
    });
    out.waveNodes = nodes.slice(0, 10).map((el) => ({
      tag: el.tagName,
      text: (el.innerText || '').slice(0, 40),
      className: String(el.className || '').slice(0, 80),
    }));
    for (const el of nodes.slice(0, 5)) {
      try {
        el.click();
        out.clicked = true;
      } catch {}
    }
    return out;
  });
  steps.push({ waveInject });
  await page.waitForTimeout(2000);

  // Read page JS for setWaveMode and try to toggle via React event path: mode toggle near Ready
  // Many UIs put mode as segmented control — click by exact text after lobby settles
  for (const label of ['Wave', 'Online', 'Squad', 'Find Public', 'Create', 'Local']) {
    await tryClick(new RegExp(`^${label}$`, 'i'), `exact-${label}`);
  }

  // Start play if Ready enabled
  try {
    const play = page.locator('button.play-button').first();
    if (await play.isVisible().catch(() => false)) {
      const disabled = await play.isDisabled().catch(() => true);
      steps.push({ playDisabled: disabled });
      if (!disabled) {
        await play.click();
        steps.push({ playClicked: true });
        await page.waitForTimeout(5000);
      }
    }
  } catch (e) {
    steps.push({ play: e.message });
  }

  // If still in lobby, force local wave via evaluating against module scope is hard;
  // instead drive UI: open squad window from toolbar after play, or settings Online.
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch {}

  // Gameplay in whatever mode we entered
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(500 + Math.sin(i / 3) * 200, 400 + Math.cos(i / 5) * 150);
    if (i % 5 === 0) await page.keyboard.down('Space');
    if (i % 5 === 1) await page.keyboard.up('Space');
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(4000);

  // Probe engine state from page (if any global)
  const stateProbe = await page.evaluate(() => {
    const text = (document.body.innerText || '').slice(0, 3000);
    const hasWaveUi = /wave\s*\d+|start wave|next wave|wave mode/i.test(text);
    return {
      textSnippet: text,
      hasWaveUi,
      title: document.title,
      shell: document.querySelector('main')?.className || '',
    };
  });
  steps.push({ stateProbe });

  // Deep scan page bundle for wave-only asset URL patterns and fetch any not yet local
  const pageJsPath = path.join(OUT, 'js', 'page-CUHzIhAp.js');
  const pageJs = fs.readFileSync(pageJsPath, 'utf8');
  const waveRelatedPaths = new Set();
  // Extract nearby asset paths around waveMode / setWaveMode / advanceWave
  for (const needle of ['setWaveMode', 'advanceWave', 'waveMode', 'waveMobs', 'startWave', 'waveStart']) {
    let i = 0;
    let n = 0;
    while ((i = pageJs.indexOf(needle, i)) !== -1 && n < 8) {
      const slice = pageJs.slice(Math.max(0, i - 500), i + 800);
      const re = /\/(?:assets|fonts|_next\/static)\/[A-Za-z0-9._\-\/]+\.(?:png|webp|svg|jpg|jpeg|gif|js|json|css|ttf|woff2?)/g;
      let m;
      while ((m = re.exec(slice))) waveRelatedPaths.add(m[0]);
      i += needle.length;
      n++;
    }
  }
  // Also strings containing wave in path
  const pathRe = /\/assets\/[^"'`\s]*wave[^"'`\s]*/gi;
  let m;
  while ((m = pathRe.exec(pageJs))) waveRelatedPaths.add(m[0].replace(/["'`)\]},;]+$/, ''));

  steps.push({ waveRelatedPathCount: waveRelatedPaths.size, sample: [...waveRelatedPaths].slice(0, 40) });

  const origin = new URL(TARGET).origin;
  for (const p of waveRelatedPaths) {
    const url = p.startsWith('http') ? p : origin + p;
    if (resources.has(url)) continue;
    const siteFile = path.join(SITE, ...new URL(url).pathname.split('/').filter(Boolean));
    if (fs.existsSync(siteFile) && fs.statSync(siteFile).size > 0) {
      // Copy into wave archive for the dedicated set
      const body = fs.readFileSync(siteFile);
      await saveBody(url, body, '', 'copied-from-local-mirror-near-wave-refs', resources);
      continue;
    }
    try {
      const res = await fetchBuf(url);
      if (res.status === 200) {
        await saveBody(url, res.body, res.headers['content-type'], 'wave-reference-fetch', resources);
      } else {
        errors.push(`fetch ${url} -> ${res.status}`);
      }
    } catch (e) {
      errors.push(`fetch ${url} -> ${e.message}`);
    }
  }

  // Screenshot + HTML
  await page.screenshot({ path: path.join(WAVE, 'reports', 'wave-session.png'), fullPage: true });
  fs.writeFileSync(path.join(WAVE, 'html', 'wave-page.html'), await page.content());

  // Storage dump (non-sensitive)
  const storage = await page.evaluate(() => {
    const out = { localStorage: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/token|password|secret|auth|credential/i.test(k)) out.localStorage[k] = '[REDACTED]';
      else out.localStorage[k] = localStorage.getItem(k);
    }
    return out;
  });
  fs.writeFileSync(path.join(WAVE, 'reports', 'storage.json'), JSON.stringify(storage, null, 2));

  const list = [...resources.values()];
  const report = {
    target: TARGET,
    finishedAt: new Date().toISOString(),
    resourceCount: list.length,
    totalBytes: list.reduce((a, b) => a + b.size, 0),
    steps,
    errors: errors.slice(0, 50),
    note:
      'Wave mode client logic lives in the main page bundle. Dedicated wave assets are recorded here if the session or wave-adjacent references loaded them.',
  };
  fs.writeFileSync(path.join(WAVE, 'reports', 'wave-capture.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(WAVE, 'reports', 'manifest.json'), JSON.stringify(list, null, 2));
  fs.writeFileSync(
    path.join(WAVE, 'network', 'network-log.json'),
    JSON.stringify(networkLog, null, 2)
  );

  const md = [
    '# Wave Mode Resource Capture',
    '',
    `Target: ${TARGET}`,
    `Files saved under wave/: ${list.length}`,
    `Bytes: ${report.totalBytes}`,
    '',
    '## How Wave works in this client',
    '',
    '- Local: `setWaveMode(true)` in engine (same `page-*.js` bundle).',
    '- Online: Squad `mode: wave` + server snapshots (`wave`, `waveMobs`).',
    '- No separate WASM; uses shared mob/petal assets.',
    '',
    '## Session result',
    '',
    '```json',
    JSON.stringify(
      {
        ready: steps.find((s) => s.ready)?.ready,
        hasWaveUi: stateProbe.hasWaveUi,
        shell: stateProbe.shell,
        waveRelatedPaths: waveRelatedPaths.size,
        lobbyButtons: lobby.buttons,
      },
      null,
      2
    ),
    '```',
    '',
    '## Files',
    '',
    ...list.map((r) => `- ${r.localPath} ← ${r.url} (${r.size} B, ${r.method})`),
  ].join('\n');
  fs.writeFileSync(path.join(WAVE, 'reports', 'wave-resources.md'), md);
  fs.writeFileSync(path.join(OUT, 'wave-resources.md'), md);

  await browser.close();
  console.log(
    JSON.stringify(
      {
        files: list.length,
        bytes: report.totalBytes,
        hasWaveUi: stateProbe.hasWaveUi,
        waveRelatedPaths: waveRelatedPaths.size,
        lobbyWaveButtons: lobby.buttons,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
