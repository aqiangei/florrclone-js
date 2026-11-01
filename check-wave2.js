const fs = require('fs');
const s = fs.readFileSync('florr-site-download/js/page-CUHzIhAp.js', 'utf8');

function around(needle, n = 5, b = 120, a = 280) {
  let i = 0;
  let c = 0;
  while ((i = s.indexOf(needle, i)) !== -1 && c < n) {
    console.log('\n=== ' + needle + ' @ ' + i + ' ===');
    console.log(s.slice(Math.max(0, i - b), i + a));
    i += needle.length;
    c++;
  }
}

around('`wave`');
around('"wave"');
around('adventure`,`wave');
around('waveMobs');
around('startWave');
around('Wave');
around('Squad');
around('setGameMode');
around('gameMode:');
around('mode:`wave');
around('mode:"wave');
around('onWave');
around('waveMode=!0');
around('waveMode=!1');
around('waveMode=true');
around('.waveMode=');
