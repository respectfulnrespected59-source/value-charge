// The HTTP headers VALUE CHARGE is served with.
// render.yaml must carry the same values (tests/unit/render-config.test.mjs checks it),
// so the headers the tests run under locally are the ones Render serves live.

// Outside services the page talks to: vector map tiles + fonts + sprites (OpenFreeMap)
// and place search (Nominatim, with Photon as the backup). Nothing else.
export const CONNECT_ORIGINS = Object.freeze([
  'https://tiles.openfreemap.org',
  'https://nominatim.openstreetmap.org',
  'https://photon.komoot.io',
]);

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // No 'unsafe-inline': the page has no inline <style> or style="", and MapLibre moves its
  // elements through the CSSOM (element.style), which CSP does not restrict.
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${CONNECT_ORIGINS.join(' ')}`,
  "worker-src 'self'",
  "child-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
});
// HSTS is not set here: Render's edge sends its own (10 years, preload) and
// replaces any value we declare. scripts/audit_live.mjs checks it is present.
export const MIN_HSTS_SECONDS = 31536000;

export const CACHE_RULES = Object.freeze([
  // The map engine's folder carries its version, so a new version is a new URL.
  { prefix: '/vendor/', value: 'public, max-age=31536000, immutable' },
  { prefix: '/fonts/', value: 'public, max-age=86400' },
  { prefix: '/img/', value: 'public, max-age=86400' },
  { prefix: '/data/', value: 'public, max-age=3600' },
]);
export const ALWAYS_CHECK = 'no-cache';
// Paths that must always revalidate so a deploy shows up on the next visit.
export const NO_CACHE_PATHS = Object.freeze(['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/css/*', '/js/*']);

export function cacheControlFor(urlPath) {
  return CACHE_RULES.find((rule) => urlPath.startsWith(rule.prefix))?.value || ALWAYS_CHECK;
}
