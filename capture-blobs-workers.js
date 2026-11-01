/**
 * Capture ALL blobs including those created inside Workers via CDP auto-attach.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const TARGET = 'https://152.32.173.78/';
const OUT = path.resolve(__dirname, 'web-game-archive');
const BLOB = path.join(OUT, 'blob-resources');
fs.mkdirSync(BLOB, { recursive: true });

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const byUrl = new Map();
const byHash = new Map();
let seq = 0;

const indexPath = path.join(BLOB, '_index.json');
if (fs.existsSync(indexPath)) {
  for (const it of JSON.parse(fs.readFileSync(indexPath, 'utf8'))) {
    byUrl.set(it.url, it);
    if (it.sha256) byHash.set(it.sha256, it.localPath);
  }
  seq = byHash.size;
}

function save(url, mime, body, source) {
  if (!body || !body.length) return false;
  const hash = sha256(body);
  let lp = byHash.get(hash);
  if (!lp) {
    let ext = '.bin';
    const m = (mime || '').toLowerCase();
    const head = body.slice(0, 200).toString('utf8');
    if (m.includes('svg') || head.includes('<svg')) ext = '.svg';
    else if (m.includes('png')) ext = '.png';
    else if (m.includes('jpeg') || m.includes('jpg')) ext = '.jpg';
    else if (m.includes('webp')) ext = '.webp';
    lp = `blob-resources/blob_${String(++seq).padStart(4, '0')}_${hash.slice(0, 16)}${ext}`;
    fs.writeFileSync(path.join(OUT, lp), body);
    byHash.set(hash, lp);
  }
  if (!byUrl.has(url) || byUrl.get(url).size < body.length) {
    byUrl.set(url, {
      url,
      localPath: lp,
      size: body.length,
      sha256: hash,
      mime: mime || 'application/octet-stream',
      source,
      savedAt: new Date().toISOString(),
    });
    process.stdout.write(`+${byUrl.size} `);
  }
  return true;
}

const HOOK_SOURCE = `
(() => {
  if (globalThis.__BA_INSTALLED__) return;
  globalThis.__BA_INSTALLED__ = true;
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
    clone.arrayBuffer().then(b => push(url, blob.type || 'application/octet-stream', b, source))
      .catch(e => S.errors.push(String(e)))
      .finally(() => { S.pending--; });
  };
  const refs = Object.create(null);
  const oc = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(obj) {
    const url = oc(obj);
    try {
      if (typeof Blob !== 'undefined' && obj instanceof Blob) {
        refs[url] = obj.slice(0, obj.size, obj.type);
        read(url, refs[url], 'createObjectURL');
      }
    } catch (e) { S.errors.push(String(e)); }
    return url;
  };
  URL.revokeObjectURL = function() { /* keep alive */ };
  globalThis.__BD = () => ({
    items: S.order.map(u => S.byUrl[u]).filter(Boolean),
    pending: S.pending,
    count: S.order.length,
    errors: S.errors.slice(-20),
  });
})();
`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  await context.addInitScript({ content: HOOK_SOURCE });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK_SOURCE });

  // Attach to workers before they run
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });

  const workerSessions = [];
  cdp.on('Target.attachedToTarget', async (ev) => {
    const { sessionId, targetInfo } = ev;
    const type = targetInfo.type;
    console.log('\nattached', type, targetInfo.url || targetInfo.title || '');
    try {
      // Use flat session via connection
      const session = cdp; // with flatten, events include sessionId — use send with sessionId if supported
      // Playwright CDPSession doesn't expose child sessions easily; use Target.sendMessageToTarget fallback
      await cdp.send('Runtime.evaluate', {
        expression: HOOK_SOURCE,
        awaitPromise: false,
      }).catch(() => {});
    } catch {}
    try {
      await cdp.send('Runtime.runIfWaitingForDebugger');
    } catch {}
    // Better: create session from browser CDP
    try {
      const browserCdp = await context.newCDPSession(page);
      // Actually need session for the worker target — use Playwright's CDP with sessionId param if available
    } catch {}
    workerSessions.push({ sessionId, type, url: targetInfo.url });
  });

  // Flat mode: listen for events with sessionId and send commands to that session
  // Playwright's CDPSession.send doesn't take sessionId — use connection raw
  const client = cdp;
  const raw = page.context();
  // Use browser-level CDP
  const browserSession = await browser.newBrowserCDPSession();
  await browserSession.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });

  browserSession.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }) => {
    const t = targetInfo.type;
    if (t !== 'worker' && t !== 'service_worker' && t !== 'shared_worker') {
      if (waitingForDebugger) {
        try {
          await browserSession.send('Runtime.runIfWaitingForDebugger', {}, { sessionId }).catch(async () => {
            // older protocol: Target.sendMessageToTarget
          });
        } catch {}
      }
      return;
    }
    console.log('\nworker attach', targetInfo.url || targetInfo.title);
    try {
      await browserSession.send('Runtime.evaluate', { expression: HOOK_SOURCE }, { sessionId });
    } catch (e) {
      try {
        await browserSession.send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({
            id: Date.now(),
            method: 'Runtime.evaluate',
            params: { expression: HOOK_SOURCE },
          }),
        });
      } catch (e2) {
        console.log('worker hook fail', e.message || e2.message);
      }
    }
    try {
      await browserSession.send('Runtime.runIfWaitingForDebugger', {}, { sessionId });
    } catch {
      try {
        await browserSession.send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id: Date.now() + 1, method: 'Runtime.runIfWaitingForDebugger', params: {} }),
        });
      } catch {}
    }
  });

  const inflight = new Set();
  const pull = (url, mime) => {
    if (!url || !url.startsWith('blob:') || inflight.has(url)) return;
    if (byUrl.has(url)) return;
    inflight.add(url);
    page
      .evaluate(async (u) => {
        const r = await fetch(u);
        return { mime: r.headers.get('content-type') || '', bytes: Array.from(new Uint8Array(await r.arrayBuffer())) };
      }, url)
      .then((g) => {
        if (g && g.bytes && g.bytes.length) save(url, g.mime || mime, Buffer.from(g.bytes), 'cdp-fetch');
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

  console.log('goto');
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText(/Ready/i).waitFor({ timeout: 90000 }).catch(() => {});
  console.log('ready');

  // Ensure play
  for (let i = 0; i < 30; i++) {
    const play = page.locator('.play-button');
    const vis = await play.isVisible().catch(() => false);
    const dis = await play.isDisabled().catch(() => true);
    if (vis && !dis) {
      await play.click();
      console.log('clicked play');
      break;
    }
    // try click Ready text
    await page.getByText(/^Ready$/i).first().click({ timeout: 500 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(2000);

  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel', 'Garden', 'Desert']) {
    const btn = page.getByText(map, { exact: true }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      console.log('\nbiome', map);
      await page.waitForTimeout(3000);
      for (let i = 0; i < 60; i++) {
        await page.mouse.move(200 + (i % 10) * 100, 150 + Math.floor(i / 10) * 90);
        if (i % 3 === 0) {
          await page.keyboard.down('Space');
          await page.waitForTimeout(150);
          await page.keyboard.up('Space');
        }
        await page.waitForTimeout(50);
      }
      await page.keyboard.press('KeyM').catch(() => {});
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  for (const k of ['KeyZ', 'KeyX', 'KeyC', 'KeyR', 'KeyZ', 'Escape']) {
    await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(1200);
  }

  // Drain main world
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => (typeof __BD === 'function' ? __BD() : { pending: 0 })).catch(() => ({ pending: 0 }));
    if ((st.pending || 0) === 0 && inflight.size === 0) break;
    await page.waitForTimeout(200);
  }

  const dump = await page.evaluate(() => (typeof __BD === 'function' ? __BD() : { items: [], count: 0 })).catch(() => ({ items: [], count: 0 }));
  console.log('\nmain hook', dump.count);
  for (const it of dump.items || []) {
    if (it.bytes && it.bytes.length) save(it.url, it.mime, Buffer.from(it.bytes), it.source || 'main');
  }

  // Try dump from all frames
  for (const frame of page.frames()) {
    try {
      const d = await frame.evaluate(() => (typeof __BD === 'function' ? __BD() : null));
      if (d && d.items) {
        for (const it of d.items) {
          if (it.bytes && it.bytes.length) save(it.url, it.mime, Buffer.from(it.bytes), 'frame');
        }
      }
    } catch {}
  }

  // Final: scrape any blob: from performance + document images
  const extras = await page.evaluate(async () => {
    const urls = new Set();
    for (const e of performance.getEntriesByType('resource')) {
      if (e.name.startsWith('blob:')) urls.add(e.name);
    }
    for (const img of document.images) {
      if (img.src && img.src.startsWith('blob:')) urls.add(img.src);
    }
    const out = [];
    for (const u of urls) {
      try {
        const r = await fetch(u);
        out.push({ url: u, mime: r.headers.get('content-type') || '', bytes: Array.from(new Uint8Array(await r.arrayBuffer())), ok: true });
      } catch (e) {
        out.push({ url: u, ok: false });
      }
    }
    return out;
  });
  for (const a of extras) {
    if (a.ok && a.bytes && a.bytes.length) save(a.url, a.mime, Buffer.from(a.bytes), 'dom-scan');
  }

  fs.writeFileSync(indexPath, JSON.stringify([...byUrl.values()], null, 2));

  const report = {
    uniqueUrls: byUrl.size,
    uniqueFiles: byHash.size,
    bytes: [...byUrl.values()].filter((s, i, a) => a.findIndex((x) => x.sha256 === s.sha256) === i).reduce((n, s) => n + s.size, 0),
    mainHookCount: dump.count,
    workersAttached: workerSessions.length,
  };
  fs.writeFileSync(path.join(OUT, 'reports', 'blob-capture.json'), JSON.stringify(report, null, 2));
  console.log('\n' + JSON.stringify(report, null, 2));

  const zipPath = path.resolve(__dirname, 'web-game-archive.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
  console.log('zip', fs.statSync(zipPath).size);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
