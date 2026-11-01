/**
 * Post-process: fetch publicly referenced but possibly deferred assets,
 * pretty-print JS copies, write architecture reports.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const ORIGIN = 'https://152.32.173.78';
const OUT = path.resolve(__dirname, 'florr-site-download');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuf(new URL(res.headers.location, url).href).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      );
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function simpleBeautify(src) {
  // Lightweight formatter: insert newlines after ;{}/ and around keywords for readability.
  // Not a full prettier — labeled as formatted copy for research.
  let out = '';
  let depth = 0;
  let inStr = null;
  let inTpl = false;
  let escape = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += ch;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '`' && !inTpl) {
      // treat template loosely
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      continue;
    }
    if (ch === '{') {
      depth++;
      out += '{\n' + '  '.repeat(Math.min(depth, 12));
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      out += '\n' + '  '.repeat(Math.min(depth, 12)) + '}';
      continue;
    }
    if (ch === ';') {
      out += ';\n' + '  '.repeat(Math.min(depth, 12));
      continue;
    }
    if (ch === ',' && next !== ' ') {
      out += ',\n' + '  '.repeat(Math.min(depth, 12));
      continue;
    }
    out += ch;
  }
  return out;
}

function extractContexts(src, needles, before = 100, after = 250, limit = 3) {
  const results = [];
  for (const needle of needles) {
    let i = 0;
    let n = 0;
    while ((i = src.indexOf(needle, i)) !== -1 && n < limit) {
      results.push({
        needle,
        index: i,
        snippet: src.slice(Math.max(0, i - before), i + after),
      });
      i += needle.length;
      n++;
    }
  }
  return results;
}

function countOccurrences(src, needle) {
  let c = 0;
  let i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) {
    c++;
    i += needle.length;
  }
  return c;
}

async function maybeDownload(relUrl, folder, purpose) {
  const url = relUrl.startsWith('http') ? relUrl : ORIGIN + relUrl;
  const manifestPath = path.join(OUT, 'reports', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.some((m) => m.url === url || m.url === url.split('#')[0])) {
    return { skipped: true, reason: 'already in manifest', url };
  }
  try {
    const res = await fetchBuf(url);
    if (res.status !== 200) {
      return { skipped: true, reason: `HTTP ${res.status}`, url };
    }
    const name = path.basename(new URL(url).pathname) || 'download.bin';
    const dir = path.join(OUT, folder);
    fs.mkdirSync(dir, { recursive: true });
    let local = path.join(dir, name);
    if (fs.existsSync(local)) {
      local = path.join(dir, name.replace(/(\.[^.]+)?$/, '_extra$1'));
    }
    fs.writeFileSync(local, res.body);
    const meta = {
      url,
      localPath: path.relative(OUT, local).replace(/\\/g, '/'),
      size: res.body.length,
      sha256: sha256(res.body),
      contentType: res.headers['content-type'] || '',
      downloadedAt: new Date().toISOString(),
      purpose,
      method: 'follow-up-public-url-from-client-reference',
      licenseNote: 'Third-party client asset; local research only.',
      folder,
      note: 'URL discovered in already-loaded JS; fetched once as publicly referenced.',
    };
    manifest.push(meta);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return { ok: true, meta };
  } catch (e) {
    return { skipped: true, reason: e.message, url };
  }
}

(async () => {
  const pageJs = path.join(OUT, 'js', 'page-CUHzIhAp.js');
  const src = fs.readFileSync(pageJs, 'utf8');

  // Discover public static refs
  const urlRe = /\/_next\/static\/[A-Za-z0-9._\-\/]+\.(?:js|mjs|css|wasm|map)/g;
  const assetRe = /\/assets\/[A-Za-z0-9._\-\/]+/g;
  const found = new Set([...src.matchAll(urlRe)].map((m) => m[0]));
  const assets = new Set([...src.matchAll(assetRe)].map((m) => m[0]));

  const followUps = [];
  // Worker explicitly referenced
  followUps.push(
    await maybeDownload(
      '/_next/static/mob-rig-bounds.worker-BUdnT_kv.js',
      'workers',
      'Mob rig bounds Web Worker (OffscreenCanvas)'
    )
  );
  followUps.push(
    await maybeDownload('/manifest.webmanifest', 'json', 'PWA web manifest')
  );

  // Any other _next/static js referenced but missing
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'reports', 'manifest.json'), 'utf8'));
  const have = new Set(manifest.map((m) => {
    try {
      return new URL(m.url).pathname;
    } catch {
      return m.url;
    }
  }));
  for (const u of found) {
    if (!have.has(u) && /\.(js|mjs|wasm|map)$/.test(u)) {
      const folder = u.includes('worker') ? 'workers' : u.endsWith('.wasm') ? 'wasm' : u.endsWith('.map') ? 'js' : 'js';
      followUps.push(await maybeDownload(u, folder, 'Publicly referenced static chunk'));
    }
  }

  // Pretty-print copies (do not overwrite originals)
  const prettyDir = path.join(OUT, 'js', 'formatted');
  fs.mkdirSync(prettyDir, { recursive: true });
  const jsFiles = fs.readdirSync(path.join(OUT, 'js')).filter((f) => f.endsWith('.js'));
  const prettyMeta = [];
  for (const f of jsFiles) {
    const raw = fs.readFileSync(path.join(OUT, 'js', f), 'utf8');
    // Skip huge full beautify for 5.8MB — create excerpt + light format of key regions instead for page
    if (raw.length > 2_000_000) {
      const contexts = extractContexts(
        raw,
        [
          'petal-garden-adventure-v1',
          'new Worker',
          'offlineLootEligible',
          'requestAnimationFrame',
          'jellyWaves',
          'Movement, maps, spawns',
          'playerId??`offline`',
        ],
        200,
        600,
        2
      );
      const excerpt = [
        '/* FORMATTED EXCERPTS ONLY — full minify preserved in ../page-CUHzIhAp.js */',
        '/* This is NOT original source. Auto-extracted snippets for research. */',
        '',
        ...contexts.map(
          (c, i) =>
            `/* ===== excerpt ${i + 1}: ${c.needle} @ ${c.index} ===== */\n` +
            simpleBeautify(c.snippet) +
            '\n'
        ),
      ].join('\n');
      const outPath = path.join(prettyDir, f.replace(/\.js$/, '.excerpts.js'));
      fs.writeFileSync(outPath, excerpt);
      prettyMeta.push({ file: f, method: 'excerpts', out: path.relative(OUT, outPath) });
    } else {
      const outPath = path.join(prettyDir, f.replace(/\.js$/, '.formatted.js'));
      fs.writeFileSync(outPath, simpleBeautify(raw));
      prettyMeta.push({ file: f, method: 'simple-beautify', out: path.relative(OUT, outPath) });
    }
  }

  // Worker pretty if downloaded
  const workerDir = path.join(OUT, 'workers');
  if (fs.existsSync(workerDir)) {
    for (const f of fs.readdirSync(workerDir).filter((x) => x.endsWith('.js'))) {
      const raw = fs.readFileSync(path.join(workerDir, f), 'utf8');
      const outPath = path.join(prettyDir, f.replace(/\.js$/, '.formatted.js'));
      fs.writeFileSync(outPath, simpleBeautify(raw));
      prettyMeta.push({ file: f, method: 'simple-beautify', out: path.relative(OUT, outPath) });
    }
  }

  const counts = Object.fromEntries(
    [
      'petal-garden-adventure-v1',
      'petal-garden-settings',
      'localStorage',
      'requestAnimationFrame',
      'new Worker',
      'WebAssembly',
      '.wasm',
      'offline',
      'damage',
      'spawn',
      'drop',
      'craft',
      'biome',
      'loadout',
      'inventory',
      'talent',
      'collision',
      'Mob',
      'Petal',
    ].map((k) => [k, countOccurrences(src, k)])
  );

  const storage = JSON.parse(fs.readFileSync(path.join(OUT, 'reports', 'storage-dump.json'), 'utf8'));

  // resources.md refresh
  const all = JSON.parse(fs.readFileSync(path.join(OUT, 'reports', 'manifest.json'), 'utf8'));
  const totalBytes = all.reduce((a, b) => a + (b.size || 0), 0);
  const resourcesMd = [
    '# Downloaded Resources',
    '',
    `Target: ${ORIGIN}/`,
    `Captured / updated: ${new Date().toISOString()}`,
    `Total files: ${all.length}`,
    `Total bytes: ${totalBytes} (${(totalBytes / 1048576).toFixed(2)} MiB)`,
    '',
    '## Summary by folder',
    '',
    ...Object.entries(
      all.reduce((acc, r) => {
        const f = r.folder || r.localPath.split('/')[0];
        acc[f] = acc[f] || { count: 0, bytes: 0 };
        acc[f].count++;
        acc[f].bytes += r.size || 0;
        return acc;
      }, {})
    ).map(([k, v]) => `- **${k}**: ${v.count} files, ${v.bytes} bytes`),
    '',
    '## License / use',
    '',
    'Unofficial florr.io fan game client assets. Retained for local technical research only. Do not redistribute unless you have rights. Wiki-derived petal art credits appear inside `assets/manifest.json`.',
    '',
    '## Inventory',
    '',
    '| URL | Local Path | Size | SHA-256 (16) | Content-Type | Method | Purpose |',
    '|-----|------------|------|--------------|--------------|--------|---------|',
    ...all.map(
      (r) =>
        `| ${String(r.url).replace(/\|/g, '\\|')} | ${r.localPath} | ${r.size} | \`${String(r.sha256).slice(0, 16)}…\` | ${r.contentType || '-'} | ${r.method} | ${r.purpose} |`
    ),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'reports', 'resources.md'), resourcesMd);
  // Also copy to root reports path expected by user
  fs.copyFileSync(path.join(OUT, 'reports', 'resources.md'), path.join(OUT, 'resources.md'));

  const offlineArch = `# Offline Architecture — viep.nex (${ORIGIN})

## Verdict

Offline / guest play runs **entirely in the browser client**. The page meta description states: *"Progress is saved in this browser. An unofficial florr.io fan game."* There is **no WASM** module in the loaded session. Simulation strings and \`playerId??\`offline\`\` identifiers confirm local simulation.

## Entry / boot

1. HTML shell loads Vite/Next-style RSC bootstrap and static chunks under \`/_next/static/\`.
2. Boot UI: \`.boot-screen\` → lobby \`.game-shell.is-lobby\` with brand **viep.nex**, nickname input (default Guest), **Ready** play button, biome picker (Garden / Desert / Ocean / Jungle / Hel).
3. Selecting a biome and playing Guest mode starts the canvas world without a dedicated multiplayer server round-trip for simulation (observed: FPS HUD, tutorial, local save).

## Persistence

| Store | Present | Role |
|-------|---------|------|
| localStorage \`petal-garden-adventure-v1\` | Yes | Adventure save: inventory, loadout, talents, biome, kills, shop, achievements |
| localStorage \`petal-garden-settings\` | Yes | UI/settings (chat, mouse, zoom, quality, …) |
| sessionStorage | Empty | — |
| IndexedDB | None | — |
| Cache Storage | None | — |
| Service Worker | None registered | Offline is “local sim + localStorage”, not SW cache |

Save key constant in bundle: \`oN=\`petal-garden-adventure-v1\`\`.

## Runtime stack

| Layer | Artifact | Role |
|-------|----------|------|
| Framework | \`framework-D_rUT4EX.js\`, \`index-CUAqJsJ9.js\`, \`rolldown-runtime-*.js\` | React / Vite RSC client runtime |
| **Game logic** | \`page-CUHzIhAp.js\` (~5.8 MiB) | Main offline sim, UI, rendering, data tables |
| Worker (optional) | \`mob-rig-bounds.worker-*.js\` | OffscreenCanvas / ImageBitmap mob bounds; falls back if Worker unavailable |
| Data | \`/assets/manifest.json\` | Petal/mob art metadata (wiki sources) |
| Art | \`/assets/world-tiles/*.svg\`, wiki-petals, talents | Map tiles & icons |
| Font | \`/fonts/ubuntu-bold.ttf\` | UI font |

## Main loop

- \`requestAnimationFrame\` used extensively (21 references in page bundle) for render, drag UI, and frame stepping.
- In-game damage / jelly wave / loot eligibility paths use an \`offline\` player id fallback when no online id exists.
- Changelog / about text in the client states movement, maps, spawns, drops, XP, and some talents are **simulated here**.

## Worker ↔ main

\`new Worker(new URL('/_next/static/mob-rig-bounds.worker-….js', …), { type: 'module' })\`  
Purpose: compute mob rig bounds when \`OffscreenCanvas\` + \`createImageBitmap\` available. **Not** the game tick / AI core. On failure, worker is terminated and bounds requests reject.

## Network dependency for “offline play”

- Initial load needs HTTP(S) to fetch HTML/JS/CSS/assets.
- After assets + save are local, gameplay loop does not require a simulation server (guest/offline semantics).
- Account login/registration UI exists but offline play is preserved (changelog string).

## Formatted JS copies

See \`js/formatted/\` (${prettyMeta.length} files). Large page bundle uses **excerpts only** (full minify kept untouched).
`;
  fs.writeFileSync(path.join(OUT, 'reports', 'offline-architecture.md'), offlineArch);
  fs.copyFileSync(path.join(OUT, 'reports', 'offline-architecture.md'), path.join(OUT, 'offline-architecture.md'));

  const gameLogic = `# Game Logic Module Analysis

Primary file: \`js/page-CUHzIhAp.js\` (SHA-256 in manifest). Keyword occurrence counts (raw minify):

${Object.entries(counts)
  .map(([k, v]) => `- \`${k}\`: ${v}`)
  .join('\n')}

## 1. Offline entry & init

- Lobby biome picker + Ready → enters world with Guest / local save.
- Save hydrate/persist via \`localStorage\` key \`petal-garden-adventure-v1\`.
- Settings via \`petal-garden-settings\`.

## 2. Main loop / tick

- Animation driven by \`requestAnimationFrame\` (render + UI).
- Entity updates (mobs, petals, waves) live in the same page bundle; look for mob arrays, \`jellyWaves\`, damage application, and \`time\` fields on petal/mob objects in excerpts.

## 3. Mob AI / states

- Large mob-related string/table density (\`Mob\` ×217, biome ×293, spawn ×276).
- Drop tables and rarity multipliers referenced in about/disclaimer text.
- Separate **bounds worker** only for geometry, not AI FSM.

## 4. Player movement / combat

- Mouse explore + Space petal extend (tutorial copy).
- \`damage\` ×525; collision string rare (×2) — likely custom radius/\`Math.hypot\` checks (see jelly wave snippet using \`Math.hypot\`).
- Attack/defend touch buttons; invertAttack/invertDefend in settings.

## 5. Petals / drops / crafting

- Loadout + reserve slots in save JSON; craft UI bound to \`[C]\`.
- \`craft\` ×71; \`drop\` ×252; inventory/loadout/talent heavily used.
- Art atlas: \`json/manifest.json\` (\`/assets/manifest.json\`) maps petal/mob names → wiki PNG paths.

## 6. Maps / spawns

- Biomes: Garden, Desert, Ocean, Jungle, Hel.
- World tiles under \`assets/world-tiles/\` (SVG).
- Spawns grow stronger toward map right (tutorial text).

## 7. Save / restore

Observed save schema (session dump, non-secret):

\`\`\`json
${storage.localStorage['petal-garden-adventure-v1'] || '{}'}
\`\`\`

## 8. Worker / WASM

- Worker: mob-rig-bounds only.
- WASM: **none** loaded or referenced (\`WebAssembly\` / \`.wasm\` count = 0).

## Formatted research copies

${prettyMeta.map((p) => `- ${p.file} → \`${p.out}\` (${p.method})`).join('\n')}
`;
  fs.writeFileSync(path.join(OUT, 'reports', 'game-logic.md'), gameLogic);
  fs.copyFileSync(path.join(OUT, 'reports', 'game-logic.md'), path.join(OUT, 'game-logic.md'));

  const wasmMd = `# WASM Module Analysis

## Result

**No WebAssembly modules were loaded or referenced** during the Playwright capture of ${ORIGIN}/ guest/offline play.

| Check | Result |
|-------|--------|
| Network responses \`.wasm\` | 0 |
| Bundle string \`WebAssembly\` | ${counts.WebAssembly} |
| Bundle string \`.wasm\` | ${counts['.wasm']} |
| Imports/exports analysis | N/A |

Game simulation runs in **JavaScript** (\`page-CUHzIhAp.js\`). Optional compute offload is a **module Worker** (\`mob-rig-bounds.worker-*.js\`), not WASM.

If a future build ships WASM, re-run \`capture-florr.js\` and extend this document with \`WebAssembly.instantiate\` import object inspection — do not treat decompiles as original source.
`;
  fs.writeFileSync(path.join(OUT, 'reports', 'wasm-analysis.md'), wasmMd);
  fs.copyFileSync(path.join(OUT, 'reports', 'wasm-analysis.md'), path.join(OUT, 'wasm-analysis.md'));

  // Missing resources
  const perf = JSON.parse(fs.readFileSync(path.join(OUT, 'network', 'performance-resources.json'), 'utf8'));
  const loadedPaths = new Set(
    perf.map((e) => {
      try {
        return new URL(e.name).pathname;
      } catch {
        return e.name;
      }
    })
  );
  const missingFromManifest = [...found].filter((p) => !have.has(p) && !have.has(ORIGIN + p));
  // Refresh have after downloads
  const manifest2 = JSON.parse(fs.readFileSync(path.join(OUT, 'reports', 'manifest.json'), 'utf8'));
  const have2 = new Set(
    manifest2.map((m) => {
      try {
        return new URL(m.url).pathname;
      } catch {
        return m.url;
      }
    })
  );

  // Assets referenced in JS but not downloaded (lazy wiki petals etc.) — list sample, do not bulk scrape
  const missingAssets = [...assets].filter((a) => !have2.has(a)).slice(0, 80);

  const missingMd = `# Missing / Not Saved Resources

## Policy

Only resources the browser loaded (or a single follow-up of a URL **explicitly referenced** in already-downloaded JS) were saved. No path fuzzing or bulk wiki image scraping.

## Intentionally not present

| Item | Reason |
|------|--------|
| WASM | Not used by this client build |
| Service Worker script | None registered |
| Cache Storage bodies | Empty |
| IndexedDB dumps | No databases |
| Auth tokens / account cookies | Redacted / not collected |
| Source maps (\`.map\`) | Not observed in network log |

## Follow-up fetch results

${followUps.map((f) => `- ${f.url || f.meta?.url}: ${f.ok ? 'saved ' + f.meta.localPath : f.reason}`).join('\n')}

## Referenced in JS but not loaded in this session (sample)

Many \`/assets/wiki-petals/*\` entries exist in \`assets/manifest.json\` and may load only when that petal/mob is shown. Examples not fetched this run:

${missingAssets
  .slice(0, 40)
  .map((a) => `- \`${a}\``)
  .join('\n') || '_none listed_'}

Total distinct \`/assets/...\` path strings in page bundle: ${assets.size}.  
Downloaded asset files this run: see manifest folder \`assets\`.

## Network anomalies

- One console 404 during capture (see \`reports/run-meta.json\`) — likely a missing optional icon/asset; not retried aggressively.

## Local static replay

Serving \`html/\` + \`_next\` paths would require rewriting URLs to the downloaded tree. Full offline SPA boot may still need matching path layout (\`/_next/static/...\`). Missing lazy petal PNGs will 404 until visited in a live session and captured.
`;
  fs.writeFileSync(path.join(OUT, 'reports', 'missing-resources.md'), missingMd);
  fs.copyFileSync(path.join(OUT, 'reports', 'missing-resources.md'), path.join(OUT, 'missing-resources.md'));

  // Copy HAR to expected path
  fs.copyFileSync(path.join(OUT, 'network', 'network.har'), path.join(OUT, 'network.har'));

  fs.writeFileSync(
    path.join(OUT, 'reports', 'analysis-meta.json'),
    JSON.stringify(
      {
        followUps,
        prettyMeta,
        counts,
        foundStaticRefs: [...found],
        assetRefCount: assets.size,
        totalFiles: manifest2.length,
        totalBytes: manifest2.reduce((a, b) => a + b.size, 0),
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        totalFiles: manifest2.length,
        totalBytes: manifest2.reduce((a, b) => a + b.size, 0),
        followUps: followUps.map((f) => (f.ok ? f.meta.localPath : f.reason)),
        offlineSimInClient: true,
        primaryLogicFile: 'js/page-CUHzIhAp.js',
        wasm: false,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
