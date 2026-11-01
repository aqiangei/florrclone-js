/**
 * Download every publicly referenced client asset into the local mirror.
 * Sources: assets/manifest.json + path strings in already-captured JS/CSS/HTML.
 * No path fuzzing — only URLs the client already exposes.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const ORIGIN = 'https://152.32.173.78';
const ROOT = path.resolve(__dirname, 'florr-site-download');
const SITE = path.resolve(__dirname, 'florr-local-site');
const CONCURRENCY = 8;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { rejectUnauthorized: false, timeout: 60000, headers: { 'User-Agent': 'viep-local-mirror/1.0' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          fetchBuf(next).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
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

function collectUrls() {
  const urls = new Set();

  // 1) assets/manifest.json — petal + mob art
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'json', 'manifest.json'), 'utf8'));
  for (const v of Object.values(man)) {
    if (v && typeof v === 'object') {
      if (v.src) urls.add(v.src.startsWith('http') ? v.src : ORIGIN + v.src);
      if (v.thumbnail && v.thumbnail.src) {
        const t = v.thumbnail.src;
        urls.add(t.startsWith('http') ? t : ORIGIN + t);
      }
    }
  }

  // 2) Scan captured text files for /assets/... and /fonts/... and /_next/static/...
  const scanRoots = [
    path.join(ROOT, 'js'),
    path.join(ROOT, 'html'),
    path.join(ROOT, 'json'),
    path.join(ROOT, 'assets'),
  ];
  const pathRe =
    /(?:https?:\/\/152\.136\.97\.198)?(\/(?:assets|fonts|_next\/static)\/[A-Za-z0-9._\-/%]+)/g;

  function scanFile(file) {
    if (!/\.(js|css|html|json|webmanifest|svg|md)$/i.test(file)) return;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return;
    }
    // skip huge binary-ish
    if (text.length > 15_000_000) return;
    let m;
    pathRe.lastIndex = 0;
    while ((m = pathRe.exec(text))) {
      let p = m[1];
      try {
        p = decodeURIComponent(p);
      } catch {}
      // strip trailing punctuation from minify
      p = p.replace(/["'`)\]},;]+$/, '');
      if (/\.(js|mjs|css|json|webmanifest|svg|png|webp|jpe?g|gif|ttf|woff2?|otf|wasm|map|ico)$/i.test(p)) {
        urls.add(ORIGIN + p);
      }
    }
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'formatted') continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else scanFile(full);
    }
  }
  for (const r of scanRoots) walk(r);

  // Known talent icons commonly referenced (from prior capture / storage UI)
  const talentNames = [
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
  ];
  for (const t of talentNames) urls.add(`${ORIGIN}/assets/talents/${t}.svg`);

  // favicon / manifest
  urls.add(`${ORIGIN}/favicon.svg`);
  urls.add(`${ORIGIN}/manifest.webmanifest`);
  urls.add(`${ORIGIN}/assets/manifest.json`);
  urls.add(`${ORIGIN}/fonts/ubuntu-bold.ttf`);

  return [...urls];
}

function localPathsForUrl(urlStr) {
  const u = new URL(urlStr);
  const rel = u.pathname.replace(/^\/+/, '');
  return {
    site: path.join(SITE, ...rel.split('/')),
    archive: path.join(ROOT, 'assets-full', ...rel.split('/')),
  };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

(async () => {
  const urls = collectUrls();
  console.log(`Collected ${urls.length} unique public URLs`);

  const report = { ok: 0, skip: 0, fail: 0, failures: [], saved: [] };
  const manifestPath = path.join(ROOT, 'reports', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const have = new Set(manifest.map((m) => m.url));

  await mapPool(urls, CONCURRENCY, async (url) => {
    const { site, archive } = localPathsForUrl(url);
    // Skip if already on disk with non-empty size
    if (fs.existsSync(site) && fs.statSync(site).size > 0) {
      report.skip++;
      return;
    }
    try {
      const res = await fetchBuf(url);
      if (res.status !== 200) {
        report.fail++;
        report.failures.push({ url, status: res.status });
        return;
      }
      fs.mkdirSync(path.dirname(site), { recursive: true });
      fs.mkdirSync(path.dirname(archive), { recursive: true });
      fs.writeFileSync(site, res.body);
      fs.writeFileSync(archive, res.body);

      if (!have.has(url)) {
        const meta = {
          url,
          localPath: path.relative(ROOT, archive).replace(/\\/g, '/'),
          size: res.body.length,
          sha256: sha256(res.body),
          contentType: res.headers['content-type'] || '',
          downloadedAt: new Date().toISOString(),
          purpose: 'Full asset mirror (inventory/mobs/tiles)',
          method: 'manifest-and-reference-download',
          licenseNote: 'Third-party client asset; local research only.',
          folder: 'assets-full',
        };
        manifest.push(meta);
        have.add(url);
      }
      report.ok++;
      report.saved.push({ url, size: res.body.length });
      if (report.ok % 25 === 0) console.log(`… downloaded ${report.ok}`);
    } catch (e) {
      report.fail++;
      report.failures.push({ url, error: e.message });
    }
  });

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(ROOT, 'reports', 'full-asset-download.json'), JSON.stringify(report, null, 2));

  // Also ensure site has assets/manifest.json
  const manSrc = path.join(ROOT, 'json', 'manifest.json');
  if (fs.existsSync(manSrc)) {
    fs.mkdirSync(path.join(SITE, 'assets'), { recursive: true });
    fs.copyFileSync(manSrc, path.join(SITE, 'assets', 'manifest.json'));
  }

  console.log(
    JSON.stringify(
      {
        collected: urls.length,
        downloaded: report.ok,
        skippedExisting: report.skip,
        failed: report.fail,
        failSample: report.failures.slice(0, 15),
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
