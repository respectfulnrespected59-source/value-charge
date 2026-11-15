// Download the US Department of Energy's public E85 station list (Alternative Fuels Data Center).
// The API moved from developer.nrel.gov to developer.nlr.gov when NREL became the
// National Laboratory of the Rockies; the old host no longer resolves.
// Usage: node scripts/data/fetch-afdc.mjs   (NLR_API_KEY env var optional; DEMO_KEY allows 10 calls an hour)
import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://developer.nlr.gov/api/alt-fuel-stations/v1.json';
const MIN_EXPECTED = 3000; // 4,790 open public E85 stations on 2026-11-15

async function main() {
  const params = new URLSearchParams({
    api_key: process.env.NLR_API_KEY || 'DEMO_KEY',
    fuel_type: 'E85',
    status: 'E',
    access: 'public',
    country: 'US',
  });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`AFDC answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const stations = json.fuel_stations;
  if (!Array.isArray(stations) || stations.length < MIN_EXPECTED) {
    throw new Error(`AFDC returned only ${stations?.length ?? 0} stations`);
  }
  await mkdir(new URL('../../data-raw/', import.meta.url), { recursive: true });
  await writeFile(new URL('../../data-raw/afdc-e85.json', import.meta.url), JSON.stringify(json));
  console.log(`AFDC: ${stations.length} E85 stations`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
