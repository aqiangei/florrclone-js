const fs = require('fs');
const s = fs.readFileSync('florr-site-download/js/page-CUHzIhAp.js', 'utf8');

function around(needle, n = 4, b = 100, a = 320) {
  let i = 0,
    c = 0;
  while ((i = s.indexOf(needle, i)) !== -1 && c < n) {
    console.log('\n=== ' + needle + ' @ ' + i + ' ===');
    console.log(s.slice(Math.max(0, i - b), i + a));
    i += needle.length;
    c++;
  }
}

const keys = [
  'WebSocket',
  'websocket',
  'wss://',
  'ws://',
  'snapshot',
  'inputAck',
  'protocol',
  'squadCreate',
  'squadJoin',
  'squadFind',
  'gameMode',
  'visualAck',
  'pending.get',
  'pingMs',
  'reconnect',
  'RTCPeerConnection',
  'fetch(',
  '/api/',
];
for (const k of keys) {
  let c = 0,
    i = 0;
  while ((i = s.indexOf(k, i)) !== -1) {
    c++;
    i += k.length;
    if (c > 9999) break;
  }
  console.log(c + '\t' + k);
}

around('WebSocket');
around('wss://');
around('ws://');
around('type:`snapshot`');
around('type:a_(`snapshot`)');
around('squadCreate');
around('inputAck');
around('protocol:a_(3)');
around('new WebSocket');
around('onmessage');
around('JSON.stringify');
around('/api/');
