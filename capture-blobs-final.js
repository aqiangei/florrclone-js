const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const OUT = path.resolve(__dirname, 'web-game-archive');
const BLOB = path.join(OUT, 'blob-resources');
fs.mkdirSync(BLOB, { recursive: true });

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const byUrl = new Map();
const byHash = new Map();
let seq = 0;
const idx = path.join(BLOB, '_index.json');
if (fs.existsSync(idx)) {
  for (const it of JSON.parse(fs.readFileSync(idx, 'utf8'))) {
    byUrl.set(it.url, it);
    if (it.sha256) byHash.set(it.sha256, it.localPath);
  }
  seq = byHash.size;
}

function save(url, mime, body, src) {
  if (!body || !body.length) return;
  const h = sha(body);
  let lp = byHash.get(h);
  if (!lp) {
    let ext = '.bin';
    const m = (mime || '').toLowerCase();
    const head = body.slice(0, 200).toString('utf8');
    if (m.includes('svg') || head.includes('<svg')) ext = '.svg';
    else if (m.includes('png')) ext = '.png';
    else if (m.includes('jpeg') || m.includes('jpg')) ext = '.jpg';
    else if (m.includes('webp')) ext = '.webp';
    lp = `blob-resources/blob_${String(++seq).padStart(4, '0')}_${h.slice(0, 16)}${ext}`;
    fs.writeFileSync(path.join(OUT, lp), body);
    byHash.set(h, lp);
  }
  if (!byUrl.has(url) || byUrl.get(url).size < body.length) {
    byUrl.set(url, {
      url,
      localPath: lp,
      size: body.length,
      sha256: h,
      mime: mime || 'application/octet-stream',
      source: src,
      savedAt: new Date().toISOString(),
    });
    process.stdout.write(`+${byUrl.size} `);
  }
}

const HOOK = `(()=>{if(globalThis.__BA__)return;globalThis.__BA__=1;const S=globalThis.__BA={byUrl:Object.create(null),order:[],pending:0};
const push=(u,m,buf,s)=>{const b=new Uint8Array(buf);if(!S.byUrl[u])S.order.push(u);S.byUrl[u]={url:u,mime:m,size:b.length,bytes:[...b],source:s};};
const read=(u,blob,s)=>{S.pending++;blob.slice(0,blob.size,blob.type).arrayBuffer().then(b=>push(u,blob.type||'application/octet-stream',b,s)).finally(()=>S.pending--);};
const oc=URL.createObjectURL.bind(URL);URL.createObjectURL=function(o){const u=oc(o);if(o instanceof Blob)read(u,o.slice(0,o.size,o.type),'create');return u;};
URL.revokeObjectURL=function(){};
globalThis.__BD=()=>({items:S.order.map(u=>S.byUrl[u]).filter(Boolean),pending:S.pending,count:S.order.length});})();`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript({ content: HOOK });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

  page.on('worker', async (w) => {
    console.log('\npage worker', w.url());
    try {
      await w.evaluate(HOOK);
    } catch (e) {
      console.log('worker eval', e.message);
    }
  });

  const inflight = new Set();
  const pull = (u) => {
    if (!u || !u.startsWith('blob:') || byUrl.has(u) || inflight.has(u)) return;
    inflight.add(u);
    page
      .evaluate(async (u) => {
        const r = await fetch(u);
        return { m: r.headers.get('content-type') || '', b: [...new Uint8Array(await r.arrayBuffer())] };
      }, u)
      .then((g) => {
        if (g && g.b && g.b.length) save(u, g.m, Buffer.from(g.b), 'cdp');
      })
      .catch(() => {})
      .finally(() => inflight.delete(u));
  };
  cdp.on('Network.responseReceived', (p) => {
    const u = p.response && p.response.url;
    if (u && u.startsWith('blob:')) pull(u);
  });
  cdp.on('Network.requestWillBeSent', (p) => {
    const u = p.request && p.request.url;
    if (u && u.startsWith('blob:')) pull(u);
  });

  await page.goto('https://152.32.173.78/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText(/Ready/i).waitFor({ timeout: 90000 }).catch(() => {});
  console.log('ready');

  for (let i = 0; i < 20; i++) {
    await page.locator('.play-button').click({ timeout: 800 }).catch(() => {});
    await page.getByText('Ready', { exact: true }).click({ timeout: 500 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  for (const map of ['Garden', 'Desert', 'Ocean', 'Jungle', 'Hel', 'Garden', 'Desert', 'Ocean', 'Jungle', 'Hel']) {
    const b = page.getByText(map, { exact: true }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      console.log('\nbiome', map);
      await page.waitForTimeout(3500);
      for (let i = 0; i < 80; i++) {
        await page.mouse.move(180 + (i % 12) * 95, 140 + Math.floor(i / 12) * 85);
        if (i % 3 === 0) {
          await page.keyboard.down('Space');
          await page.waitForTimeout(100);
          await page.keyboard.up('Space');
        }
        await page.waitForTimeout(45);
      }
      await page.keyboard.press('KeyM');
      await page.waitForTimeout(600);
      await page.keyboard.press('Escape');
    }
  }

  for (const k of ['KeyZ', 'KeyX', 'KeyC', 'KeyR', 'KeyZ', 'KeyX', 'KeyC', 'Escape']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(900);
  }

  for (let i = 0; i < 50; i++) {
    const st = await page.evaluate(() => (typeof __BD === 'function' ? __BD() : { pending: 0 }));
    if (!st.pending && !inflight.size) break;
    await page.waitForTimeout(200);
  }

  const d = await page.evaluate(() => (typeof __BD === 'function' ? __BD() : { items: [], count: 0 }));
  console.log('\nhook', d.count);
  for (const it of d.items || []) {
    if (it.bytes && it.bytes.length) save(it.url, it.mime, Buffer.from(it.bytes), it.source || 'hook');
  }

  const live = await page.evaluate(async () => {
    const d = typeof __BD === 'function' ? __BD() : { items: [] };
    const out = [];
    for (const it of d.items) {
      try {
        const r = await fetch(it.url);
        out.push({ url: it.url, m: r.headers.get('content-type') || '', b: [...new Uint8Array(await r.arrayBuffer())], ok: 1 });
      } catch {
        out.push({ url: it.url, ok: 0 });
      }
    }
    return out;
  });
  for (const a of live) {
    if (a.ok && a.b && a.b.length) save(a.url, a.m, Buffer.from(a.b), 'live');
  }

  fs.writeFileSync(idx, JSON.stringify([...byUrl.values()], null, 2));
  const report = { urls: byUrl.size, uniqueFiles: byHash.size, hook: d.count };
  fs.writeFileSync(path.join(OUT, 'reports', 'blob-capture.json'), JSON.stringify(report, null, 2));
  console.log('\nTOTAL', report);

  const zip = path.resolve(__dirname, 'web-game-archive.zip');
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zip}' -Force"`, {
    stdio: 'inherit',
  });
  console.log('zip', fs.statSync(zip).size);

  // final content recount
  function walk(dir, a = []) {
    if (!fs.existsSync(dir)) return a;
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      if (fs.statSync(f).isDirectory()) walk(f, a);
      else a.push(f);
    }
    return a;
  }
  const folders = ['pages', 'scripts', 'styles', 'wasm', 'workers', 'images', 'fonts', 'configs', 'binary', 'blob-resources'];
  let files = 0,
    bytes = 0;
  for (const f of folders) {
    for (const p of walk(path.join(OUT, f))) {
      if (p.endsWith('_index.json')) continue;
      files++;
      bytes += fs.statSync(p).size;
    }
  }
  console.log(JSON.stringify({ contentFiles: files, contentBytes: bytes, zip }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
