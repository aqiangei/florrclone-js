const fs = require('fs');
const s = fs.readFileSync('florr-site-download/js/page-CUHzIhAp.js', 'utf8');

function around(needle, n = 3, b = 200, a = 400) {
  let i = 0;
  let c = 0;
  while ((i = s.indexOf(needle, i)) !== -1 && c < n) {
    console.log('\n### ' + needle + ' @ ' + i);
    console.log(s.slice(Math.max(0, i - b), i + a));
    i += needle.length;
    c++;
  }
}

around('setWaveMode');
around('children:`Wave`');
around('children:"Wave"');
around('`Wave`');
around('Wave ·');
around('modeLabel');
around('onlineMode');
around('Local ·');
around('children:`Local`');
around('game-mode');
around('gameMode');
around('mode-picker');
around('waveStart');
around('advanceWave');
around('sa(this.save.biome)'); // wave biome check helper nearby
