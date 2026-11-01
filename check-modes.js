const fs = require('fs');
const path = require('path');

const s = fs.readFileSync('florr-site-download/js/page-CUHzIhAp.js', 'utf8');
const site = 'florr-local-site';

function count(k) {
  let c = 0,
    i = 0;
  while ((i = s.indexOf(k, i)) !== -1) {
    c++;
    i += k.length;
  }
  return c;
}

function around(needle, n = 3, b = 90, a = 240) {
  const out = [];
  let i = 0,
    c = 0;
  while ((i = s.indexOf(needle, i)) !== -1 && c < n) {
    out.push(s.slice(Math.max(0, i - b), i + a));
    i += needle.length;
    c++;
  }
  return out;
}

// Biome / world names often used as string literals
const candidates = [
  'Garden',
  'Desert',
  'Ocean',
  'Jungle',
  'Hel',
  'Pyramid',
  'Sewers',
  'Sewer',
  'Ant Hell',
  'AntHell',
  'Factory',
  'Dark Forest',
  'DarkForest',
  'Centralia',
  'wave',
  'adventure',
  'online',
  'offline',
  'squad',
  'guild',
  'wormVisit',
  'moundVisit',
  'termite',
  'Overmind',
  'Dungeon',
  'Raid',
  'Boss',
  'PvP',
  'Arena',
  'Tutorial',
  'Creative',
  'Sandbox',
  'Hardcore',
  'Ultra',
  'nextWorldId',
  'roomId',
  'gameMode',
];

console.log('=== keyword counts ===');
for (const k of candidates) console.log(count(k) + '\t' + k);

// Extract biome union-like lists
console.log('\n=== biome-looking arrays ===');
const biomeArr = s.match(/\[[^\]]{0,200}Garden[^\]]{0,200}Desert[^\]]{0,400}\]/g) || [];
biomeArr.slice(0, 15).forEach((x, i) => console.log(i, x.slice(0, 300)));

console.log('\n=== mode UI strings ===');
['Adventure', 'Wave', 'Online', 'Offline', 'Squad', 'Guild', 'Find Public', 'Local'].forEach((k) => {
  around(k, 2, 60, 160).forEach((sn) => console.log('\n--', k, '--\n', sn));
});

console.log('\n=== sub-world / visit flags ===');
['wormVisit', 'moundVisit', 'termiteRooms', 'nextWorldId', 'Pyramid', 'Sewers', 'Factory', 'Ant'].forEach(
  (k) => {
    const sn = around(k, 1, 40, 180);
    if (sn[0]) console.log('\n--', k, '--\n', sn[0]);
  }
);

// Check if separate JS chunks exist beyond what we have
const chunkRe = /\/_next\/static\/[^"'`\s]+\.js/g;
const chunks = new Set();
let m;
while ((m = chunkRe.exec(s))) chunks.add(m[0]);
console.log('\n=== JS chunks referenced in page bundle ===');
[...chunks].forEach((c) => {
  const local = path.join(site, ...c.split('/').filter(Boolean));
  console.log((fs.existsSync(local) ? 'OK ' : 'MISS') + '\t' + c);
});

// Asset dirs on disk
console.log('\n=== local asset dirs ===');
function walkCount(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += walkCount(path.join(dir, e.name));
    else n++;
  }
  return n;
}
const assetRoot = path.join(site, 'assets');
if (fs.existsSync(assetRoot)) {
  for (const e of fs.readdirSync(assetRoot, { withFileTypes: true })) {
    if (e.isDirectory()) console.log(e.name, walkCount(path.join(assetRoot, e.name)));
    else console.log('(file)', e.name);
  }
}

// Manifest keys that look like modes/worlds
const man = JSON.parse(fs.readFileSync('florr-site-download/json/manifest.json', 'utf8'));
const mobs = Object.keys(man).filter((k) => (man[k].src || '').includes('/mobs/'));
console.log('\nmob art keys', mobs.length);
console.log(mobs.join(', '));
