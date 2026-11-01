const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const OUT = path.resolve(__dirname, 'web-game-archive');
const SITE = path.resolve(__dirname, 'florr-local-site');
const ONLINE = path.resolve(__dirname, 'online-game-archive');

function sha(b) {
  return crypto.createHash('sha256').update(b).digest('hex');
}
function walk(d, a = []) {
  if (!fs.existsSync(d)) return a;
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    if (fs.statSync(f).isDirectory()) walk(f, a);
    else a.push(f);
  }
  return a;
}

let copied = 0;
function copyIfMissing(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied++;
}

// Sync florr-local-site into archive
for (const f of walk(path.join(SITE, 'assets'))) {
  const rel = path.relative(path.join(SITE, 'assets'), f);
  copyIfMissing(f, path.join(OUT, 'images', 'assets', ...rel.split(/[/\\]/)));
  copyIfMissing(f, path.join(OUT, 'mirror', 'assets', ...rel.split(/[/\\]/)));
}
for (const rootName of ['_next', 'fonts']) {
  const root = path.join(SITE, rootName);
  for (const f of walk(root)) {
    const rel = path.relative(SITE, f);
    copyIfMissing(f, path.join(OUT, 'mirror', ...rel.split(/[/\\]/)));
    if (rel.includes('chunks') || rel.endsWith('.js')) {
      copyIfMissing(f, path.join(OUT, 'scripts', path.basename(f)));
    }
    if (rel.endsWith('.css')) copyIfMissing(f, path.join(OUT, 'styles', path.basename(f)));
    if (rel.includes('worker')) copyIfMissing(f, path.join(OUT, 'workers', path.basename(f)));
  }
}
copyIfMissing(path.join(SITE, 'index.html'), path.join(OUT, 'pages', 'index.html'));
copyIfMissing(path.join(SITE, 'favicon.svg'), path.join(OUT, 'images', 'favicon.svg'));
copyIfMissing(path.join(SITE, 'manifest.webmanifest'), path.join(OUT, 'manifests', 'manifest.webmanifest'));
copyIfMissing(path.join(SITE, 'assets', 'manifest.json'), path.join(OUT, 'configs', 'assets-manifest.json'));

// Bring online WS metadata / HAR if present
copyIfMissing(
  path.join(ONLINE, 'websocket', 'session-metadata.json'),
  path.join(OUT, 'network', 'websocket-session-metadata.json')
);
copyIfMissing(path.join(ONLINE, 'network', 'session.har'), path.join(OUT, 'network', 'online-session.har'));

console.log('copied', copied);

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
  'packages',
  'blob-resources',
  'data-resources',
  'mirror',
  'manifests',
];
const records = [];
for (const folder of folders) {
  for (const f of walk(path.join(OUT, folder))) {
    const body = fs.readFileSync(f);
    records.push({
      path: path.relative(OUT, f).replace(/\\/g, '/'),
      size: body.length,
      sha256: sha(body),
      folder,
    });
  }
}

fs.mkdirSync(path.join(OUT, 'metadata'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'metadata', 'resources.json'), JSON.stringify(records, null, 2));
fs.writeFileSync(
  path.join(OUT, 'metadata', 'checksums.sha256'),
  records.map((r) => `${r.sha256}  ${r.path}`).join('\n') + '\n'
);

const by = {};
for (const r of records) {
  by[r.folder] = by[r.folder] || { count: 0, bytes: 0 };
  by[r.folder].count++;
  by[r.folder].bytes += r.size;
}
const total = records.reduce((a, b) => a + b.size, 0);

const summary = [
  '# Full client archive',
  '',
  `Target: https://152.32.173.78/`,
  `Files: ${records.length}`,
  `Bytes: ${total} (${(total / 1048576).toFixed(2)} MiB)`,
  '',
  '## By folder',
  '',
  ...Object.entries(by).map(([k, v]) => `- **${k}**: ${v.count} files, ${v.bytes} bytes`),
  '',
  '## Notes',
  '',
  '- All publicly referenced assets from `/assets/manifest.json`, static chunks, tiles, talents, blobs observed in-browser.',
  '- No path fuzzing. Audio/video/wasm: none served by this client build.',
  '- Credentials not stored.',
  '',
].join('\n');

fs.mkdirSync(path.join(OUT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'reports', 'download-summary.md'), summary);
fs.writeFileSync(
  path.join(OUT, 'reports', 'missing-resources.md'),
  '# Missing\n\n- WASM/audio/video: not used by this site build (0 observed).\n- Auth-only private data: excluded.\n- WS payloads: metadata only (see network/websocket-session-metadata.json).\n'
);

const zipAlt = path.resolve(__dirname, 'web-game-archive-full.zip');
const zipMain = path.resolve(__dirname, 'web-game-archive.zip');
if (fs.existsSync(zipAlt)) {
  try {
    fs.unlinkSync(zipAlt);
  } catch {}
}

console.log('Compressing…');
execFileSync(
  'powershell.exe',
  ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zipAlt}' -Force`],
  { stdio: 'inherit' }
);

let finalZip = zipAlt;
try {
  if (fs.existsSync(zipMain)) fs.unlinkSync(zipMain);
  fs.renameSync(zipAlt, zipMain);
  finalZip = zipMain;
} catch (e) {
  console.log('Could not replace web-game-archive.zip (locked?):', e.message);
  console.log('Using', zipAlt);
}

const zipBytes = fs.statSync(finalZip).size;
const zipEntries = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `(Add-Type -AssemblyName System.IO.Compression.FileSystem); [IO.Compression.ZipFile]::OpenRead('${finalZip.replace(/'/g, "''")}').Entries.Count`,
  ],
  { encoding: 'utf8' }
).trim();

const stats = {
  files: records.length,
  totalBytes: total,
  byFolder: by,
  zipPath: finalZip,
  zipBytes,
  zipEntries: Number(zipEntries) || zipEntries,
  finishedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, 'reports', 'full-download-stats.json'), JSON.stringify(stats, null, 2));
fs.appendFileSync(
  path.join(OUT, 'reports', 'download-summary.md'),
  `\n## ZIP\n\n\`${finalZip}\`\nEntries: ${zipEntries}\nBytes: ${zipBytes}\n`
);

console.log(JSON.stringify(stats, null, 2));
