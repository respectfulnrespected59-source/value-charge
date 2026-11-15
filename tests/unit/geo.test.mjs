import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundsForRadius, circlePolygon, distanceMiles, tileKey, tilesForRadius, TILE_DEGREES } from '../../public/js/lib/geo.js';

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const ROUND_ROCK = { lat: 30.5083, lng: -97.6789 };

test('distanceMiles matches the known Austin to Round Rock distance', () => {
  const miles = distanceMiles(AUSTIN, ROUND_ROCK);
  assert.ok(miles > 16.5 && miles < 17.2, `got ${miles}`);
});

test('distanceMiles is zero for the same point and symmetric', () => {
  assert.equal(distanceMiles(AUSTIN, AUSTIN), 0);
  assert.equal(distanceMiles(AUSTIN, ROUND_ROCK), distanceMiles(ROUND_ROCK, AUSTIN));
});

test('tileKey floors to the tile grid, including negative longitudes', () => {
  assert.equal(TILE_DEGREES, 2);
  assert.equal(tileKey(30.2672, -97.7431), '30_-98');
  assert.equal(tileKey(31.999, -96.001), '30_-98');
  assert.equal(tileKey(32, -96), '32_-96');
  assert.equal(tileKey(-0.5, 0.5), '-2_0');
});

test('tilesForRadius covers every tile the search circle touches', () => {
  const near = tilesForRadius(AUSTIN, 5);
  assert.deepEqual(near, ['30_-98']);
  const wide = tilesForRadius({ lat: 31.95, lng: -96.05 }, 25);
  for (const key of ['30_-98', '30_-96', '32_-98', '32_-96']) assert.ok(wide.includes(key), `missing ${key}`);
  assert.equal(new Set(wide).size, wide.length, 'no duplicate tiles');
});

test('tilesForRadius widens east-west at high latitude', () => {
  const north = tilesForRadius({ lat: 61.2, lng: -149.9 }, 100);
  const south = tilesForRadius({ lat: 25.8, lng: -80.2 }, 100);
  const span = (keys) => new Set(keys.map((k) => k.split('_')[1])).size;
  assert.ok(span(north) > span(south), 'Anchorage needs more longitude tiles than Miami');
});

test('circlePolygon is a closed ring whose every point sits on the radius', () => {
  const { type, coordinates: [ring] } = circlePolygon(AUSTIN, 25, 32);
  assert.equal(type, 'Polygon');
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
  for (const [lng, lat] of ring) assert.ok(Math.abs(distanceMiles(AUSTIN, { lat, lng }) - 25) < 0.01);
});

test('boundsForRadius returns a box that contains the circle', () => {
  const [[west, south], [east, north]] = boundsForRadius(AUSTIN, 25);
  assert.ok(west < AUSTIN.lng && east > AUSTIN.lng && south < AUSTIN.lat && north > AUSTIN.lat);
  const edge = { lat: north, lng: AUSTIN.lng };
  assert.ok(Math.abs(distanceMiles(AUSTIN, edge) - 25) < 0.5);
});
