import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function filesUnder(dir) {
  return readdirSync(join(PUBLIC, dir)).flatMap((name) => {
    const full = join(PUBLIC, dir, name);
    return statSync(full).isDirectory() ? filesUnder(relative(PUBLIC, full)) : [relative(PUBLIC, full).split(sep).join('/')];
  });
}

test('the offline copy lists every script, stylesheet and font the app loads', () => {
  const needed = [...filesUnder('js'), ...filesUnder('css'), ...filesUnder('fonts')];
  assert.ok(needed.length > 15, 'the walk found the app files');
  const missing = needed.filter((file) => !shell.includes(file));
  assert.deepEqual(missing, [], 'add these to SHELL in public/sw.js, or the app breaks offline');
});

test('every file in the offline list exists (one 404 makes the whole install fail)', () => {
  const absent = shell.filter((file) => file !== './' && !existsSync(join(PUBLIC, file)));
  assert.deepEqual(absent, []);
});

test('the map engine version in map.js matches package.json and the vendored folder', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const mapJs = readFileSync(join(PUBLIC, 'js/ui/map.js'), 'utf8');
  const version = mapJs.match(/const MAPLIBRE_VERSION = '([\d.]+)'/)[1];
  assert.equal(version, pkg.devDependencies['maplibre-gl']);
  assert.ok(existsSync(join(PUBLIC, `vendor/maplibre-gl-${version}/maplibre-gl-csp.js`)), 'run npm run vendor');
});
