/**
 * Rebuild original URL paths from capture manifest and serve locally.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname, 'florr-site-download');
const SITE = path.resolve(__dirname, 'florr-local-site');
const PORT = Number(process.env.PORT) || 8787;
const ORIGIN = 'https://152.32.173.78';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
};

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function urlToSitePath(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    return null;
  }
  if (!urlStr.startsWith(ORIGIN) && u.hostname !== '152.32.173.78') return null;
  let p = u.pathname;
  if (p === '/' || p === '') p = '/index.html';
  return path.join(SITE, ...p.split('/').filter(Boolean));
}

function buildSite() {
  ensureDir(SITE);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'manifest.json'), 'utf8'));
  let n = 0;
  const map = [];
  for (const item of manifest) {
    const dest = urlToSitePath(item.url);
    if (!dest) continue;
    const src = path.join(ROOT, item.localPath);
    if (!fs.existsSync(src)) {
      map.push({ url: item.url, error: 'missing local file', localPath: item.localPath });
      continue;
    }
    copyFile(src, dest);
    n++;
    map.push({ url: item.url, dest: path.relative(SITE, dest).replace(/\\/g, '/') });
  }

  // Prefer live page snapshot if it exists (more complete DOM), else index.html
  const snap = path.join(ROOT, 'html', 'page-snapshot.html');
  const indexDest = path.join(SITE, 'index.html');
  // Use original SSR index (has RSC bootstrap) — snapshot is post-hydration and may break boot
  const indexSrc = path.join(ROOT, 'html', 'index.html');
  if (fs.existsSync(indexSrc)) copyFile(indexSrc, indexDest);

  // Extra known paths
  const extras = [
    ['json/manifest.webmanifest', 'manifest.webmanifest'],
    ['workers/mob-rig-bounds.worker-BUdnT_kv.js', '_next/static/mob-rig-bounds.worker-BUdnT_kv.js'],
  ];
  for (const [from, to] of extras) {
    const src = path.join(ROOT, from);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(SITE, to));
      n++;
    }
  }

  fs.writeFileSync(path.join(SITE, '_build-map.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: n, map }, null, 2));
  console.log(`Built ${n} files into ${SITE}`);
  return n;
}

function resolveRequest(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') p = '/index.html';
  const filePath = path.join(SITE, ...p.split('/').filter(Boolean));
  if (!filePath.startsWith(SITE)) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  // try directory index
  const asIndex = path.join(filePath, 'index.html');
  if (fs.existsSync(asIndex)) return asIndex;
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const filePath = resolveRequest(req.url || '/');
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${req.url}\n(Local mirror may be missing this lazy asset.)`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log(`Serving ${SITE}`);
    console.log(`Open: ${url}`);
    // Windows: open default browser
    if (process.platform === 'win32') {
      exec(`start "" "${url}"`);
    }
  });
}

buildSite();
startServer();
