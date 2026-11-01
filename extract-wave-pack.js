/**
 * Build a dedicated Wave resource pack from the already-downloaded client:
 * - wave logic excerpts (not claimed as original source)
 * - wave config / spawn tables embedded in JS
 * - shared art used by wave (mobs) copied into wave/pack
 * - documentation of removed online Wave entry
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, 'florr-site-download');
const SITE = path.resolve(__dirname, 'florr-local-site');
const WAVE = path.join(ROOT, 'wave');
const PACK = path.join(WAVE, 'pack');
const PAGE = path.join(ROOT, 'js', 'page-CUHzIhAp.js');

fs.mkdirSync(path.join(PACK, 'logic'), { recursive: true });
fs.mkdirSync(path.join(PACK, 'data'), { recursive: true });
fs.mkdirSync(path.join(PACK, 'assets', 'mobs'), { recursive: true });
fs.mkdirSync(path.join(WAVE, 'reports'), { recursive: true });

const src = fs.readFileSync(PAGE, 'utf8');

function sha256(buf) {
  return crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
}

function extractAround(needle, before, after, limit = 1) {
  const out = [];
  let i = 0;
  let n = 0;
  while ((i = src.indexOf(needle, i)) !== -1 && n < limit) {
    out.push({
      needle,
      index: i,
      text: src.slice(Math.max(0, i - before), i + after),
    });
    i += needle.length;
    n++;
  }
  return out;
}

// --- 1) Logic excerpts ---
const logicNeedles = [
  { k: 'setWaveMode', b: 100, a: 1200, n: 3 },
  { k: 'advanceWave', b: 80, a: 2000, n: 2 },
  { k: 'Wave mode has been removed', b: 200, a: 400, n: 2 },
  { k: 'waveBest', b: 100, a: 400, n: 5 },
  { k: 'waveLevel', b: 80, a: 300, n: 5 },
  { k: 'waveMobCounts', b: 80, a: 400, n: 3 },
  { k: 'waveStart', b: 80, a: 400, n: 5 },
  { k: 'this.waveMode', b: 60, a: 250, n: 8 },
  { k: 'gameMode:r_([`adventure`,`wave`])', b: 50, a: 600, n: 2 },
  { k: 'ua(this.save.biome,this.waveStart', b: 200, a: 200, n: 2 },
];

const excerpts = [];
for (const item of logicNeedles) {
  excerpts.push(...extractAround(item.k, item.b, item.a, item.n));
}
const logicFile = path.join(PACK, 'logic', 'wave-excerpts.js');
fs.writeFileSync(
  logicFile,
  [
    '/* Wave-mode excerpts from page-CUHzIhAp.js — NOT original source; research copy */',
    `/* source sha256: ${sha256(src)} */`,
    '',
    ...excerpts.map(
      (e, i) =>
        `/* ===== ${i + 1}. ${e.needle} @ ${e.index} ===== */\n` + e.text + '\n'
    ),
  ].join('\n')
);

// --- 2) Try to locate wave biome helper sa( and wave init ua( definitions by searching function patterns ---
// Find "function ua(" or "ua=(e" near waveStart usage — heuristic scan for wave table objects
function findDef(name) {
  const patterns = [
    new RegExp(`function ${name}\\(`),
    new RegExp(`var ${name}=`),
    new RegExp(`,${name}=`),
    new RegExp(`${name}=e=>`),
    new RegExp(`${name}=\\(`),
  ];
  for (const re of patterns) {
    const m = re.exec(src);
    if (m) return m.index;
  }
  return -1;
}

const defs = {};
for (const name of ['ua', 'ma', 'da', 'fa', 'sa', 'hx']) {
  const idx = findDef(name);
  defs[name] = idx;
  if (idx >= 0) {
    const slice = src.slice(idx, idx + 3500);
    fs.writeFileSync(path.join(PACK, 'logic', `def-candidate-${name}.js`), slice);
  }
}

// --- 3) Extract waveBest / wave-related save schema strings ---
const saveKeys = new Set();
const keyRe = /wave[A-Za-z0-9_]*/g;
let km;
while ((km = keyRe.exec(src))) saveKeys.add(km[0]);

// --- 4) Collect mob types referenced near advanceWave spawn loop ---
const advance = extractAround('advanceWave', 0, 5000, 1)[0];
const mobTypesNearWave = new Set();
if (advance) {
  const typeRe = /type:`([A-Za-z][A-Za-z0-9' -]{1,40})`/g;
  let tm;
  while ((tm = typeRe.exec(advance.text))) mobTypesNearWave.add(tm[1]);
}

// Broader: mob keys from assets/manifest that are mobs
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'json', 'manifest.json'), 'utf8'));
const mobEntries = {};
for (const [k, v] of Object.entries(man)) {
  if (!v || !v.src) continue;
  if (String(v.src).includes('/mobs/') || /^[a-z]/.test(k) || k.startsWith('mob-')) {
    mobEntries[k] = v;
  }
}

// Copy all mob assets into wave pack (Wave uses same mob art)
let copied = 0;
const copyLog = [];
for (const [k, v] of Object.entries(mobEntries)) {
  const rel = v.src.replace(/^\//, '');
  const fromSite = path.join(SITE, ...rel.split('/'));
  const fromFull = path.join(ROOT, 'assets-full', ...rel.split('/'));
  const srcFile = fs.existsSync(fromSite) ? fromSite : fs.existsSync(fromFull) ? fromFull : null;
  if (!srcFile) {
    copyLog.push({ key: k, src: v.src, status: 'missing' });
    continue;
  }
  const dest = path.join(PACK, 'assets', ...rel.split('/').slice(1)); // assets/mobs/...
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(srcFile, dest);
  copied++;
  copyLog.push({ key: k, src: v.src, status: 'copied', bytes: fs.statSync(dest).size });
}

fs.writeFileSync(path.join(PACK, 'data', 'wave-mob-art-manifest.json'), JSON.stringify(mobEntries, null, 2));
fs.writeFileSync(path.join(PACK, 'data', 'wave-identifiers.json'), JSON.stringify({
  waveRelatedIdentifiers: [...saveKeys].sort(),
  defCandidates: defs,
  mobTypesNearAdvanceWave: [...mobTypesNearWave],
  onlineRemovalMessage: 'Wave mode has been removed.',
  localEngine: {
    setWaveMode: 'offline engine still implements setWaveMode(true) → 2400×1800 map + seedMobs + wave state via ua()',
    onlineEngine: 'online subclass setWaveMode(true) only emits event "Wave mode has been removed."',
  },
}, null, 2));

// --- 5) Try enable local wave on live page via Playwright hook into React props if possible ---
// Also dump changelog mentions
const changelogHits = [];
let ci = 0;
while ((ci = src.indexOf('Wave', ci)) !== -1 && changelogHits.length < 30) {
  const slice = src.slice(Math.max(0, ci - 80), ci + 120);
  if (/changelog|September|Updated|removed|mode/i.test(slice)) changelogHits.push({ index: ci, slice });
  ci += 4;
}
fs.writeFileSync(path.join(PACK, 'data', 'wave-changelog-mentions.json'), JSON.stringify(changelogHits, null, 2));

// --- 6) README ---
const totalBytes = (function walk(d) {
  let n = 0;
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    const st = fs.statSync(p);
    n += st.isDirectory() ? walk(p) : st.size;
  }
  return n;
})(PACK);

const report = {
  builtAt: new Date().toISOString(),
  packBytes: totalBytes,
  mobArtCopied: copied,
  mobArtMissing: copyLog.filter((x) => x.status === 'missing').length,
  logicExcerpts: excerpts.length,
  note: 'Online Wave entry removed by game; local sim code + shared mob art packaged here.',
};
fs.writeFileSync(path.join(WAVE, 'reports', 'wave-pack.json'), JSON.stringify({ report, copyLog }, null, 2));

const md = `# Wave 专用资源包

## 重要结论

当前线上客户端在联网引擎里写明：**\`Wave mode has been removed.\`**
因此无法再通过正常 Online/Squad UI「进入 Wave 并抓一套新网络资源」。

本地离线引擎里仍保留完整 Wave 模拟：\`setWaveMode\` / \`advanceWave\` / \`waveStart\` / \`waveBest\` 等，
全部在已下载的 \`js/page-CUHzIhAp.js\` 中。Wave **没有独立贴图包**，怪物图与 Adventure 共用 \`/assets/mobs/\`。

## 本包内容（\`wave/pack/\`）

| 路径 | 说明 |
|------|------|
| \`logic/wave-excerpts.js\` | Wave 相关代码摘录（研究用，非原始源码） |
| \`logic/def-candidate-*.js\` | 可能的 wave 辅助函数片段 |
| \`data/wave-identifiers.json\` | Wave 标识符与架构说明 |
| \`data/wave-mob-art-manifest.json\` | Wave 会用到的 mob 贴图清单 |
| \`data/wave-changelog-mentions.json\` | 变更日志中与 Wave 相关的片段 |
| \`assets/mobs/*\` | 已复制的怪物贴图（${copied} 个） |

包大小约 **${(totalBytes / 1048576).toFixed(2)} MiB**。

## 与「再下一套」的关系

- 能公开下载的 Wave **客户端逻辑**：已在主 JS 包内 → 本目录做了摘录归档。
- 能公开下载的 Wave **贴图**：即 mob 资源 → 已复制进 \`pack/assets/mobs\`。
- **不能**再从服务器拉到「Wave 模式专属 CDN 目录」：站点未提供；联网 Wave 入口已移除。
- 会话抓取记录见 \`wave/reports/\`（先前 Playwright 跑大厅时未出现 Wave UI）。

## 本地如何自行验证离线 Wave 逻辑

需在 Guest 本地引擎（非 Online 子类）处于 \`lobby\` 时调用 \`setWaveMode(true)\`。
当前正式 UI 若已隐藏该开关，则只能通过代码层研究，不能也不应绕过 Online 的移除提示去连服务端 Wave。
`;

fs.writeFileSync(path.join(WAVE, 'WAVE-PACK.md'), md);
fs.writeFileSync(path.join(ROOT, 'wave-pack.md'), md);

console.log(JSON.stringify({ ...report, packDir: path.relative(ROOT, PACK) }, null, 2));
