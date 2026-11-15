// Copy the MapLibre GL ES-module build from node_modules into public/vendor/, so the site serves the map
// engine itself (no CDN at runtime, strict CSP: script-src 'self', worker-src 'self'). MapLibre 6 ships ES
// modules only; they are saved as .js so every host serves them with a JavaScript type (a module served as
// octet-stream is refused), and map.js points the engine at its worker with setWorkerUrl().
// Older vendored versions are removed: a stale copy would still be served.
// Usage: node scripts/vendor.mjs
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('maplibre-gl/package.json');
const DIST = new URL('../node_modules/maplibre-gl/', import.meta.url);
const VENDOR = new URL('../public/vendor/', import.meta.url);
const OUT = new URL(`maplibre-gl-${version}/`, VENDOR);
const FILES = [
  ['dist/maplibre-gl.mjs', 'maplibre-gl.js'],
  ['dist/maplibre-gl-worker.mjs', 'maplibre-gl-worker.js'],
  ['dist/maplibre-gl.css', 'maplibre-gl.css'],
  ['LICENSE.txt', 'LICENSE.txt'],
];
// The .map files are not shipped; drop the pointer so browsers do not 404 asking for them.
const SOURCE_MAP_COMMENT = /\n?\/\/# sourceMappingURL=\S+\s*$/;

for (const name of await readdir(VENDOR)) {
  if (name.startsWith('maplibre-gl-') && name !== `maplibre-gl-${version}`) {
    await rm(new URL(name, VENDOR), { recursive: true });
    console.log(`removed old vendor/${name}`);
  }
}
await mkdir(OUT, { recursive: true });
for (const [from, to] of FILES) {
  let body = await readFile(new URL(from, DIST), 'utf8');
  if (to.endsWith('.js')) body = body.replace(SOURCE_MAP_COMMENT, '\n');
  if (to.endsWith('.js') && body.includes('sourceMappingURL=')) throw new Error(`${to} still points at a source map`);
  await writeFile(new URL(to, OUT), body);
  console.log(`vendor/maplibre-gl-${version}/${to} ${body.length} bytes`);
}
