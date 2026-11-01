const fs = require('fs');
const s = fs.readFileSync('florr-site-download/js/page-CUHzIhAp.js', 'utf8');

const keys = [
  'Wave',
  'wave',
  'WAVE',
  'waveMode',
  'WaveMode',
  'gameMode',
  'GameMode',
  'adventure',
  'Adventure',
  'endless',
  'Endless',
  'survival',
  'arena',
  'jellyWaves',
  'wave-mode',
  'waves',
];

for (const k of keys) {
  let c = 0;
  let i = 0;
  while ((i = s.indexOf(k, i)) !== -1) {
    c++;
    i += k.length;
    if (c > 9999) break;
  }
  console.log(c + '\t' + k);
}

function around(needle, n = 4, b = 100, a = 220) {
  let i = 0;
  let c = 0;
  while ((i = s.indexOf(needle, i)) !== -1 && c < n) {
    console.log('\n=== ' + needle + ' @ ' + i + ' ===');
    console.log(s.slice(Math.max(0, i - b), i + a));
    i += needle.length;
    c++;
  }
}

around('Wave Mode');
around('wave mode');
around('waveMode');
around('GameMode');
around('gameMode');
around('"Wave"');
around("'Wave'");
around('`Wave`');
around('>Wave<');
around('waves:');
around('mode:`wave');
around('mode:"wave');
around('mode:\'wave');
around('jellyWaves');

// UI labels near lobby
around('biome-picker');
around('start-card');
around('Ready');
