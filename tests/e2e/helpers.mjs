// Shared setup for the browser tests: every outside service is answered from a fixture,
// and any request to a host we did not expect is blocked AND recorded. assertClean() (run
// after every test) fails on any console error, CSP violation or unexpected outside call.
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

const GLYPHS = readFileSync(new URL('../fixtures/glyphs-noto-sans-bold-0-255.pbf', import.meta.url));
// The site under test: local server, or the live site when BASE_URL is set.
export const SITE = new URL(process.env.BASE_URL || 'http://127.0.0.1:4174').origin;

// A bare map style: no vector tiles, so the test map is just the station layers.
export const MIN_STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } }],
};

export const NOMINATIM = {
  roundRockZip: [{
    lat: '30.4868503', lon: '-97.6497635', name: '78664',
    address: { postcode: '78664', city: 'Round Rock', 'ISO3166-2-lvl4': 'US-TX', country_code: 'us' },
  }],
};
export const PHOTON = {
  denver: {
    features: [{ properties: { name: 'Denver', countrycode: 'US', state: 'Colorado' }, geometry: { coordinates: [-104.9903, 39.7392] } }],
  },
};

const runs = new WeakMap();

function answer(route, body) {
  return typeof body === 'number' ? route.fulfill({ status: body, body: '' }) : route.fulfill({ json: body });
}

function routeOutside(route, calls, handlers) {
  const url = route.request().url();
  if (url.startsWith('https://tiles.openfreemap.org/styles/')) return route.fulfill({ json: MIN_STYLE });
  if (url.startsWith('https://tiles.openfreemap.org/fonts/')) {
    return route.fulfill({ body: GLYPHS, contentType: 'application/x-protobuf' });
  }
  if (url.startsWith('https://nominatim.openstreetmap.org/')) {
    calls.nominatim.push(url);
    return answer(route, handlers.nominatim(new URL(url)));
  }
  if (url.startsWith('https://photon.komoot.io/')) {
    calls.photon.push(url);
    return answer(route, handlers.photon(new URL(url)));
  }
  calls.other.push(url);
  return route.abort();
}

export async function prepare(page, { nominatim = () => [], photon = () => ({ features: [] }) } = {}) {
  const run = { calls: { nominatim: [], photon: [], other: [] }, errors: [], allowed: [] };
  runs.set(page, run);
  page.on('pageerror', (err) => run.errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') run.errors.push(msg.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.route((url) => url.origin !== SITE, (route) => routeOutside(route, run.calls, { nominatim, photon }));
  return run;
}

/** Mark console errors this test causes on purpose (e.g. a simulated outage). */
export function allowErrors(page, pattern) {
  runs.get(page)?.allowed.push(pattern);
}

export async function assertClean(page) {
  const run = runs.get(page);
  if (!run || page.isClosed()) return;
  const unexpected = run.errors.filter((text) => !run.allowed.some((pattern) => pattern.test(text)));
  expect(unexpected, 'console errors').toEqual([]);
  expect(run.calls.other, 'requests to hosts outside the allow list').toEqual([]);
  expect(await page.evaluate(() => window.__csp || []), 'CSP violations').toEqual([]);
}

export async function openApp(page, path = '/') {
  await page.goto(path);
  await expect(page.locator('.station-card, #resultsList .empty-state').first()).toBeVisible();
  await page.waitForSelector('#map[data-ready="true"]');
}

export async function listedCount(page) {
  const text = await page.locator('#resultsCount').textContent();
  return Number.parseInt(text.replace(/,/g, ''), 10);
}

export async function mapIdle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const map = window.__vcMap;
    if (map.loaded() && !map.isMoving()) resolve();
    else map.once('idle', resolve);
  }));
}
