// Download every US fuel station that OpenStreetMap lists with diesel, kerosene or E85.
// Writes data-raw/osm.json (Overpass JSON). Run occasionally, never per visitor:
// the public Overpass servers are shared and slow (an Austin-only query took 39 s).
// Usage: node scripts/data/fetch-osm.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const USER_AGENT = 'ValueChargeDataBuilder/1.0';
const TIMEOUT_S = 600;
const MIN_EXPECTED = 5000; // taginfo (11-15) counts ~9,000; far fewer means a truncated answer

export const QUERY = `[out:json][timeout:${TIMEOUT_S}];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr[amenity=fuel]["fuel:diesel"="yes"](area.us);
  nwr[amenity=fuel]["fuel:HGV_diesel"="yes"](area.us);
  nwr[amenity=fuel]["fuel:kerosene"="yes"](area.us);
  nwr[amenity=fuel]["fuel:e85"="yes"](area.us);
);
out tags center;`;

async function fetchFrom(endpoint) {
  const started = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: QUERY }),
    signal: AbortSignal.timeout((TIMEOUT_S + 60) * 1000),
  });
  if (!res.ok) throw new Error(`${endpoint} answered ${res.status}`);
  const json = await res.json();
  // Overpass reports a timeout or memory stop in `remark` while still answering 200.
  if (json.remark) throw new Error(`${endpoint} stopped early: ${json.remark}`);
  if (!Array.isArray(json.elements) || json.elements.length < MIN_EXPECTED) {
    throw new Error(`${endpoint} returned only ${json.elements?.length ?? 0} stations`);
  }
  console.log(`${endpoint}: ${json.elements.length} stations in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return json;
}

async function main() {
  const errors = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const json = await fetchFrom(endpoint);
      await mkdir(new URL('../../data-raw/', import.meta.url), { recursive: true });
      await writeFile(new URL('../../data-raw/osm.json', import.meta.url), JSON.stringify(json));
      return;
    } catch (err) {
      console.error(`skip: ${err.message}`);
      errors.push(err.message);
    }
  }
  throw new Error(`Every Overpass server failed:\n${errors.join('\n')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
