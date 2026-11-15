// Build public/data/index.json + public/data/tiles/*.json from data-raw/.
// Run after `npm run data:fetch`. Refuses to publish a dataset that looks truncated.
// Usage: node scripts/data/build-tiles.mjs
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { buildDataset, checkCounts } from './dataset.mjs';

const RAW = new URL('../../data-raw/', import.meta.url);
const OUT = new URL('../../public/data/', import.meta.url);

const isoDate = (date) => date.toISOString().slice(0, 10);

async function main() {
  const osmJson = JSON.parse(await readFile(new URL('osm.json', RAW), 'utf8'));
  const afdcJson = JSON.parse(await readFile(new URL('afdc-e85.json', RAW), 'utf8'));
  const osmStamp = osmJson.osm3s?.timestamp_osm_base;
  const doeStamp = (await stat(new URL('afdc-e85.json', RAW))).mtime;

  const { index, tiles } = buildDataset(osmJson, afdcJson, {
    built: isoDate(new Date()),
    osmDate: osmStamp ? osmStamp.slice(0, 10) : isoDate((await stat(new URL('osm.json', RAW))).mtime),
    doeDate: isoDate(doeStamp),
  });

  const problems = checkCounts(index.counts);
  if (problems.length) throw new Error(`Not publishing:\n${problems.join('\n')}`);

  // Write the new set beside the old one, then swap: a crash mid-write never leaves a half
  // dataset in public/, and a tile that emptied out does not linger.
  const staging = new URL('tiles.new/', OUT);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  let bytes = 0;
  for (const tile of tiles) {
    const body = JSON.stringify(tile);
    bytes += body.length;
    await writeFile(new URL(`${tile.key}.json`, staging), body);
  }
  await rm(new URL('tiles/', OUT), { recursive: true, force: true });
  await rename(staging, new URL('tiles/', OUT));
  await writeFile(new URL('index.json', OUT), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`${tiles.length} tiles, ${(bytes / 1e6).toFixed(2)} MB, counts ${JSON.stringify(index.counts)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
