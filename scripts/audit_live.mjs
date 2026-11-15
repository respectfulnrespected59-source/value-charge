// Ask the LIVE site what it is actually serving (not git, not the deploy log).
// Usage: node scripts/audit_live.mjs https://value-charge.onrender.com
// Exit 1 if anything is off, so it can gate a "we're live" claim.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaryMatches, lineCount } from './audit-compare.mjs';
import { MINIMUM_COUNTS } from './data/dataset.mjs';
import { CACHE_RULES, MIN_HSTS_SECONDS, SECURITY_HEADERS } from './headers.mjs';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const UA = 'ValueChargeAudit/1.0';
const SAMPLE_TILES = ['30_-98', '38_-106', '40_-88', '32_-118', '44_-94'];
const results = [];
const check = (ok, label, detail = '') => results.push({ ok: Boolean(ok), label, detail });

async function get(base, path) {
  const res = await fetch(new URL(path, base), { redirect: 'follow', cache: 'no-store', headers: { 'User-Agent': UA } });
  const isText = /text|json|javascript|manifest/.test(res.headers.get('content-type') || '');
  return { res, body: isText ? await res.text() : Buffer.from(await res.arrayBuffer()) };
}

async function localFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.endsWith(`${sep}tiles`)) continue; // sampled separately
      out.push(...await localFiles(full));
    } else out.push(relative(PUBLIC, full).split(sep).join('/'));
  }
  return out;
}

async function auditPage(base) {
  const page = await get(base, '/');
  check(page.res.status === 200, 'page answers 200', String(page.res.status));
  check(page.body.includes('VALUE <span>CHARGE</span>'), 'page carries the VALUE CHARGE header');
  check(page.body.includes('<script type="module" src="js/app.js">'), 'page loads js/app.js as a module');
  // Negatives: the QUAN-TESS preview sandbox and the demo copy must not have shipped.
  check(!page.body.includes('quantusAppError'), 'preview sandbox error reporter is ABSENT');
  check(!/illustrative|Interactive demo/i.test(page.body), 'demo "illustrative data" copy is ABSENT');
  check(!page.body.includes('fonts.googleapis.com'), 'Google Fonts link is ABSENT (fonts are self-hosted)');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    check(page.res.headers.get(name) === value, `header ${name}`, page.res.headers.get(name) || 'missing');
  }
  const hsts = page.res.headers.get('strict-transport-security') || '';
  check(Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0) >= MIN_HSTS_SECONDS, 'HTTPS enforced (HSTS >= 1 year)', hsts || 'missing');
  check(/no-cache/.test(page.res.headers.get('cache-control') || ''), 'page revalidates (no-cache)', page.res.headers.get('cache-control') || 'missing');
  const missing = await get(base, '/no-such-page-here');
  check(missing.res.status === 404, 'unknown path answers 404 (negative)', String(missing.res.status));
}

async function auditFiles(base) {
  const files = await localFiles(PUBLIC);
  let same = 0;
  for (const path of files) {
    const local = await readFile(join(PUBLIC, path));
    const { res, body } = await get(base, `/${path}`);
    const isText = typeof body === 'string';
    const polished = res.headers.get('cf-polished');
    const match = res.status === 200 && (isText
      ? lineCount(body) === lineCount(local.toString('utf8'))
      : binaryMatches({ servedBytes: body.length, localBytes: local.length, polished }));
    if (match) same += 1;
    else check(false, `/${path} matches the local file`, `${res.status} ${isText ? `${lineCount(body)} vs ${lineCount(local.toString('utf8'))} lines` : `${body.length} vs ${local.length} bytes`}`);
  }
  check(same === files.length, `all ${files.length} site files match the local build`, `${same}/${files.length}`);
  const vendor = files.find((f) => f.startsWith('vendor/') && f.endsWith('/maplibre-gl.js'));
  const { res } = await get(base, `/${vendor}`);
  const immutable = CACHE_RULES.find((r) => r.prefix === '/vendor/').value;
  check(res.headers.get('cache-control') === immutable, 'map engine caches for a year (versioned URL)', res.headers.get('cache-control') || 'missing');
  // The engine is an ES module: a browser refuses a module served with a non-JavaScript type.
  check(/javascript/.test(res.headers.get('content-type') || ''), 'map engine is served as JavaScript (module loads)', res.headers.get('content-type') || 'missing');
  check(!files.some((f) => /maplibre-gl-5\./.test(f)), 'old map engine 5.x is ABSENT from the build (negative)');
}

async function auditData(base) {
  const { res, body } = await get(base, '/data/index.json');
  let index = null;
  try { index = JSON.parse(body); } catch { index = null; }
  check(res.status === 200 && index?.v === 1, 'station index is served');
  for (const [field, min] of Object.entries(MINIMUM_COUNTS)) {
    check(index?.counts?.[field] >= min, `live index lists >= ${min} ${field}`, String(index?.counts?.[field]));
  }
  const local = JSON.parse(await readFile(join(PUBLIC, 'data/index.json'), 'utf8'));
  check(index?.built === local.built && Object.keys(index?.tiles || {}).length === Object.keys(local.tiles).length,
    'live index is the same build as local', `${index?.built} vs ${local.built}`);
  for (const key of SAMPLE_TILES) {
    const tile = await get(base, `/data/tiles/${key}.json`);
    let parsed = null;
    try { parsed = JSON.parse(tile.body); } catch { parsed = null; }
    check(tile.res.status === 200 && parsed?.stations?.length === local.tiles[key], `tile ${key} has ${local.tiles[key]} stations`, `${tile.res.status} ${parsed?.stations?.length}`);
  }
}

async function auditOutsideServices() {
  const style = await fetch('https://tiles.openfreemap.org/styles/positron', { headers: { 'User-Agent': UA } });
  const json = style.ok ? await style.json() : null;
  check(Array.isArray(json?.layers) && json.layers.length > 30, 'OpenFreeMap map style is answering', String(style.status));
}

const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/audit_live.mjs <https://site-url>');
  process.exit(2);
}
for (const step of [auditPage, auditFiles, auditData, auditOutsideServices]) {
  try {
    await step(base);
  } catch (err) {
    check(false, `${step.name} could not finish`, err.message);
  }
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail && !r.ok ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed on ${base}`);
// exitCode, not process.exit(): exiting while fetch sockets close trips a libuv abort on Windows.
process.exitCode = failed ? 1 : 0;
