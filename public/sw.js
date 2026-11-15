// VALUE CHARGE offline copy.
// - The map engine lives under a versioned folder, so it comes from the cache first.
// - Everything else on this site is fetched fresh, so a new deploy shows up on the next visit;
//   the saved copy answers only when the network fails or the server errors (a 5xx mid-deploy).
//   No "slow network" race: racing each module separately could mix old and new code.
// - Other sites' requests (map tiles, place search) are left to the browser.
// SHELL must list every app file (tests/unit/sw.test.mjs checks it against public/).
// Bump on a map-engine upgrade: activate deletes every other cache, so the old vendored engine leaves users' disks.
const CACHE = 'value-charge-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css',
  'css/app.css',
  'js/app.js',
  'js/ui/map.js',
  'js/ui/planner.js',
  'js/lib/format.js',
  'js/lib/geo.js',
  'js/lib/geocode.js',
  'js/lib/map-style.js',
  'js/lib/normalize.js',
  'js/lib/query.js',
  'js/lib/render.js',
  'js/lib/store.js',
  'js/lib/tiles.js',
  'js/lib/url-state.js',
  'fonts/barlow-condensed-normal-600.woff2',
  'fonts/barlow-condensed-normal-700.woff2',
  'fonts/barlow-condensed-normal-800.woff2',
  'fonts/dm-sans-normal-400.woff2',
  'img/icon-192.png',
  'data/index.json',
];
const VERSIONED = /\/vendor\//;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const cacheKey = (request) => (request.mode === 'navigate' ? 'index.html' : request);

async function cacheFirst(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const fresh = await fetch(event.request);
  if (fresh.ok) event.waitUntil(cache.put(event.request, fresh.clone()));
  return fresh;
}

async function networkFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const saved = () => cache.match(cacheKey(request), { ignoreSearch: true });
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      event.waitUntil(cache.put(cacheKey(request), fresh.clone()));
      return fresh;
    }
    return (fresh.status >= 500 && (await saved())) || fresh;
  } catch (err) {
    const copy = await saved();
    if (copy) return copy;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(VERSIONED.test(url.pathname) ? cacheFirst(event) : networkFirst(event));
});
