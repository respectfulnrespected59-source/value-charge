import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, checkCounts, MINIMUM_COUNTS } from '../../scripts/data/dataset.mjs';

const osmJson = {
  elements: [
    { type: 'node', id: 2, lat: 30.27, lon: -97.74, tags: { name: 'B', 'fuel:diesel': 'yes' } },
    { type: 'node', id: 1, lat: 30.28, lon: -97.75, tags: { name: 'A', 'fuel:kerosene': 'yes' } },
    { type: 'node', id: 1, lat: 30.28, lon: -97.75, tags: { name: 'A', 'fuel:kerosene': 'yes' } },
    { type: 'node', id: 3, lat: 39.74, lon: -104.99, tags: { name: 'C', 'fuel:diesel': 'yes' } },
    { type: 'node', id: 4, lat: 39.74, lon: -104.99, tags: { name: 'No fuel listed' } },
  ],
};
const afdcJson = {
  fuel_stations: [
    { id: 9, station_name: 'B E85', latitude: 30.27, longitude: -97.74, date_last_confirmed: '2026-10-01' },
    { id: 10, station_name: 'Lone E85', latitude: 41.5, longitude: -90.5 },
    { id: 11, station_name: 'Broken', latitude: null, longitude: -90.5 },
  ],
};
const dates = { built: '2026-11-15', osmDate: '2026-11-15', doeDate: '2026-11-14' };

test('buildDataset merges, dedupes, and groups stations into sorted tiles', () => {
  const { index, tiles } = buildDataset(osmJson, afdcJson, dates);
  assert.deepEqual(tiles.map((t) => t.key), ['30_-98', '38_-106', '40_-92']);
  const austin = tiles[0];
  assert.deepEqual(austin.stations.map((s) => s.id), ['osm-n1', 'osm-n2'], 'sorted by id, duplicate dropped');
  assert.deepEqual(austin.stations[1].fuels, ['diesel', 'e85'], 'DOE E85 folded into the OSM station');
  assert.deepEqual(index.counts, { stations: 4, kerosene: 1, diesel: 2, e85: 2 });
  assert.deepEqual(index.tiles, { '30_-98': 2, '38_-106': 1, '40_-92': 1 });
  assert.equal(index.v, 1);
  assert.deepEqual(index.sources, { osm: '2026-11-15', doe: '2026-11-14' });
});

test('buildDataset survives empty or missing input', () => {
  const { index, tiles } = buildDataset(null, {}, dates);
  assert.equal(tiles.length, 0);
  assert.equal(index.counts.stations, 0);
});

test('checkCounts passes a full dataset and names every shortfall in a truncated one', () => {
  assert.deepEqual(checkCounts({ stations: 13000, diesel: 8000, kerosene: 200, e85: 4700 }), []);
  const problems = checkCounts({ stations: 500, diesel: 400, kerosene: 3, e85: 4700 });
  assert.equal(problems.length, 3);
  assert.match(problems.join('\n'), /kerosene: 3 is below the floor of 100/);
  assert.equal(checkCounts({}).length, Object.keys(MINIMUM_COUNTS).length, 'missing counts fail too');
});
