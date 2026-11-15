import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALWAYS_CHECK, CACHE_RULES, NO_CACHE_PATHS, SECURITY_HEADERS, cacheControlFor } from '../../scripts/headers.mjs';

// Minimal reader for the `headers:` list in render.yaml (path / name / value triples).
function renderHeaders() {
  const text = readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8');
  const rules = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(-\s*)?(path|name|value):\s*(.+?)\s*$/);
    if (!m) continue;
    const [, dash, key, raw] = m;
    if (dash && key === 'path') {
      current = {};
      rules.push(current);
    }
    if (current) current[key] = raw.replace(/^"(.*)"$/, '$1');
  }
  return rules;
}

const rules = renderHeaders();
const find = (path, name) => rules.find((r) => r.path === path && r.name === name)?.value;

test('render.yaml serves every security header with the value the local server uses', () => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(find('/*', name), value, `${name} differs between render.yaml and scripts/headers.mjs`);
  }
});

test('render.yaml carries every cache rule from scripts/headers.mjs', () => {
  for (const { prefix, value } of CACHE_RULES) assert.equal(find(`${prefix}*`, 'Cache-Control'), value, prefix);
  for (const path of NO_CACHE_PATHS) assert.equal(find(path, 'Cache-Control'), ALWAYS_CHECK, path);
});

test('the parser really reads render.yaml (a check that cannot fail is not a check)', () => {
  assert.ok(rules.length >= 15, `only ${rules.length} header rules parsed`);
  assert.equal(find('/*', 'Not-A-Header'), undefined);
});

test('cacheControlFor matches the rules', () => {
  assert.equal(cacheControlFor('/vendor/maplibre-gl-5.24.0/maplibre-gl-csp.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControlFor('/data/tiles/30_-98.json'), 'public, max-age=3600');
  assert.equal(cacheControlFor('/js/app.js'), 'no-cache');
  assert.equal(cacheControlFor('/'), 'no-cache');
});

test('the page is allowed to ask for location, and nothing else sensitive', () => {
  const policy = SECURITY_HEADERS['Permissions-Policy'];
  assert.match(policy, /geolocation=\(self\)/);
  assert.match(policy, /camera=\(\)/);
  assert.match(policy, /microphone=\(\)/);
});
