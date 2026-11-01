'use strict';
const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict'),Wire=require('../server/wire');
const frames=JSON.parse(fs.readFileSync(process.argv[2]??'test-results/benchmark-frames.json','utf8'));
const encoder=new Wire.Encoder(),decoder=new Wire.Decoder(),gzipTimes=[],wireTimes=[],decodeTimes=[];
let gzipBytes=0,binaryBytes=0;
for(const frame of frames){
  let start=performance.now();gzipBytes+=zlib.gzipSync(JSON.stringify(frame),{level:1}).length;gzipTimes.push(performance.now()-start);
  start=performance.now();const packet=encoder.prepare(frame);packet.commit();wireTimes.push(performance.now()-start);binaryBytes+=packet.bytes.length;
  start=performance.now();const decoded=decoder.decode(packet.bytes);decodeTimes.push(performance.now()-start);assert.deepEqual(decoded,frame);
}
const p95=a=>a.sort((a,b)=>a-b)[Math.floor(a.length*.95)];
const report={frames:frames.length,exactRoundTrips:true,gzipBytes,binaryBytes,byteReduction:1-binaryBytes/gzipBytes,gzipEncodeMsP95:p95(gzipTimes),binaryEncodeMsP95:p95(wireTimes),binaryDecodeMsP95:p95(decodeTimes)};
fs.writeFileSync('test-results/benchmark-wire.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
