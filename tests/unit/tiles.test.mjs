import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTileLoader } from '../../public/js/lib/tiles.js';

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
const index = { v: 1, built: '2026-11-15', tiles: { '30_-98': 2 } };
const tile = {
  v: 1,
  key: '30_-98',
  stations: [
    { id: 'osm-n1', name: 'Good', lat: 30.27, lng: -97.74, fuels: ['diesel'] },
    { id: 'osm-n2', name: 'Bad fuel', lat: 30.27, lng: -97.74, fuels: ['jet'] },
    { id: '<script>', name: 'Bad id', lat: 30.27, lng: -97.74, fuels: ['diesel'] },
  ],
};

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (typeof route === 'function') return route();
    return route ? json(route) : json({}, 404);
  };
  return { calls, fetchImpl };
}

test('stationsNear loads only tiles listed in the index and drops malformed stations', async () => {
  const { calls, fetchImpl } = fakeFetch({ 'data/index.json': index, 'data/tiles/30_-98.json': tile });
  const loader = createTileLoader({ fetchImpl });
  const stations = await loader.stationsNear(AUSTIN, 100);
  assert.deepEqual(stations.map((s) => s.id), ['osm-n1']);
  assert.deepEqual(calls, ['data/index.json', 'data/tiles/30_-98.json'], 'no requests for tiles that do not exist');
});

test('tiles and the index are fetched once per visit', async () => {
  const { calls, fetchImpl } = fakeFetch({ 'data/index.json': index, 'data/tiles/30_-98.json': tile });
  const loader = createTileLoader({ fetchImpl });
  await loader.stationsNear(AUSTIN, 25);
  await loader.stationsNear(AUSTIN, 10);
  assert.equal(calls.length, 2);
});

test('a failed tile is retried on the next search', async () => {
  let fail = true;
  const { calls, fetchImpl } = fakeFetch({
    'data/index.json': index,
    'data/tiles/30_-98.json': () => (fail ? json({}, 503) : json(tile)),
  });
  const loader = createTileLoader({ fetchImpl });
  await assert.rejects(loader.stationsNear(AUSTIN, 5), /503/);
  fail = false;
  assert.equal((await loader.stationsNear(AUSTIN, 5)).length, 1);
  assert.equal(calls.filter((c) => c.includes('tiles/')).length, 2);
});

test('a tile request that never answers times out, and the next search fetches it fresh', async () => {
  let hang = true;
  const { calls, fetchImpl } = fakeFetch({
    'data/index.json': index,
    'data/tiles/30_-98.json': () => (hang ? new Promise(() => {}) : json(tile)),
  });
  const loader = createTileLoader({ fetchImpl, timeoutMs: 30 });
  await assert.rejects(loader.stationsNear(AUSTIN, 5), /timed out/);
  hang = false;
  assert.equal((await loader.stationsNear(AUSTIN, 5)).length, 1);
  assert.equal(calls.filter((c) => c.includes('tiles/')).length, 2);
});

test('a bad or missing index is an error, and is retried later', async () => {
  let body = { nope: true };
  const { fetchImpl } = fakeFetch({ 'data/index.json': () => json(body) });
  const loader = createTileLoader({ fetchImpl });
  await assert.rejects(loader.index(), /expected format/);
  body = index;
  assert.equal((await loader.index()).built, '2026-11-15');
});
