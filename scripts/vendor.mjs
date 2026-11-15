// Copy the MapLibre GL CSP build from node_modules into public/vendor/, so the site
// serves the map engine itself (no CDN at runtime, strict CSP with worker-src 'self').
// Usage: node scripts/vendor.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('maplibre-gl/package.json');
const DIST = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
const OUT = new URL(`../public/vendor/maplibre-gl-${version}/`, import.meta.url);
const FILES = ['maplibre-gl-csp.js', 'maplibre-gl-csp-worker.js', 'maplibre-gl.css', 'LICENSE.txt'];
// The .map files are not shipped; drop the pointer so browsers do not 404 asking for them.
const SOURCE_MAP_COMMENT = /\n?\/\/# sourceMappingURL=\S+\s*$/;

await mkdir(OUT, { recursive: true });
for (const name of FILES) {
  let body = await readFile(new URL(name, DIST), 'utf8');
  if (name.endsWith('.js')) body = body.replace(SOURCE_MAP_COMMENT, '\n');
  if (name.endsWith('.js') && body.includes('sourceMappingURL=')) throw new Error(`${name} still points at a source map`);
  await writeFile(new URL(name, OUT), body);
  console.log(`vendor/maplibre-gl-${version}/${name} ${body.length} bytes`);
}
