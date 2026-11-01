const fs = require('fs');
const path = require('path');
const SITE = path.resolve(__dirname, 'florr-local-site');

function headOk(p) {
  const h = fs.readFileSync(p).slice(0, 15).toString('utf8');
  return !(h.startsWith('<!DOCTYPE') || h.startsWith('<html') || h.startsWith('<!doctype'));
}

const man = JSON.parse(fs.readFileSync(path.join(SITE, 'assets', 'manifest.json'), 'utf8'));
const srcs = [...new Set(Object.values(man).map((v) => v && v.src).filter(Boolean))];
let miss = [];
let html = [];
let ok = 0;
for (const src of srcs) {
  const p = path.join(SITE, ...src.split('/').filter(Boolean));
  if (!fs.existsSync(p)) {
    miss.push(src);
    continue;
  }
  if (!headOk(p)) html.push(src);
  else ok++;
}

const index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const indexRefs = [...index.matchAll(/\/_next\/static\/[A-Za-z0-9_./\-]+/g)].map((m) => m[0]);
const indexCheck = indexRefs.map((r) => {
  const p = path.join(SITE, ...r.split('/').filter(Boolean));
  return { r, exists: fs.existsSync(p), ok: fs.existsSync(p) && headOk(p), bytes: fs.existsSync(p) ? fs.statSync(p).size : 0 };
});

const pagePath = path.join(SITE, '_next/static/chunks/page-tick10-746d9e01379dbea7.js');
let pageMiss = [];
if (fs.existsSync(pagePath)) {
  const page = fs.readFileSync(pagePath, 'utf8');
  const re = /(?:["'`(=]|\s)(\/(?:_next|assets|fonts)[^"'`\s)>\]]+)/g;
  const found = new Set();
  let m;
  while ((m = re.exec(page))) {
    let p = m[1].replace(/\\/g, '').replace(/[),;]+$/, '');
    if (!p.includes('${') && p.length < 300) found.add(p);
  }
  for (const src of found) {
    const p = path.join(SITE, ...src.split('/').filter(Boolean));
    if (!fs.existsSync(p)) pageMiss.push(src);
  }
}

console.log(
  JSON.stringify(
    {
      manifestOk: ok,
      manifestMiss: miss.length,
      manifestHtml: html.length,
      missSample: miss.slice(0, 20),
      indexCheck,
      pageMiss: pageMiss.length,
      pageMissSample: pageMiss.slice(0, 30),
    },
    null,
    2
  )
);
