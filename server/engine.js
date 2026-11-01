'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const BUNDLE = '_next/static/chunks/page-tick10-746d9e01379dbea7.js';
const HASH = '746d9e01379dbea7d3ac03b1fa7a48c0d4bd1cc84f6e5f1511face49140d8fd7';

// The captured client contains the simulation and its schemas. Pin the capture:
// upgrades must deliberately re-audit these boundaries and the protocol tests.
function loadEngine(webRoot) {
  const source = fs.readFileSync(path.join(webRoot, BUNDLE), 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') !== HASH)
    throw new Error('Client capture changed; re-audit server/engine.js before upgrading.');
  let code = source.slice(source.indexOf('var a='), source.indexOf(';function hj'));
  code = code.replace('c_(`type`,[q({type:g_(`input`)', 'var serverCommands=c_(`type`,[q({type:g_(`input`)');
  // Include snapshot/session validators after the intervening interpolation code.
  const start = source.lastIndexOf('var ', source.indexOf('gj=', 5710000));
  const validatorCode = source.slice(start, source.indexOf('var iM='));
  code += ';' + validatorCode;
  code += ';'+source.slice(source.indexOf('var iM='),source.indexOf(',pM=class'))+';';
  const announceStart=source.indexOf('function viepAnnounceSpawn');
  code += ';'+source.slice(announceStart,source.indexOf('\n',announceStart));
  const craftStart=source.indexOf('const viepCanCraft=');
  code += ';'+source.slice(craftStart,source.indexOf('\n',craftStart));
  const contactStart=source.indexOf('var viepBodyContact=');
  code += ';'+source.slice(contactStart,source.indexOf('\n',contactStart));
  code += ';globalThis.api={Engine:lj,defaults:ij,normalize:aj,petals:et,mobs:B,maps:Et,constants:V,craft:Mt,resolvePlayerContacts:viepBodyContact.resolvePlayerContacts,BatchDecoder:fM,commands:serverCommands,session:kj,validate:rM};';
  // UI declarations occur before the engine in this compiled module. Imports
  // are inert here; no browser, network, or rendering API is supplied.
  const inert = new Proxy(function () { return inert; }, { get: () => inert });
  const context = { console, performance, AbortSignal, AbortController, DOMException,
    structuredClone, URL, setTimeout, clearTimeout, i:inert,n:inert,r:inert,e:inert,t:inert };
  // Shared cloud CPUs can pause during the one-time initialization. This
  // deadline applies only at boot and does not change the simulation cadence.
  vm.runInNewContext(code, context, { timeout:30000, filename:'captured-simulation.js' });
  return context.api;
}
module.exports = { loadEngine, BUNDLE, HASH };
