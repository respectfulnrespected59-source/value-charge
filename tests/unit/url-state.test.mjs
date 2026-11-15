import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, parseState, serializeState } from '../../public/js/lib/url-state.js';

test('parseState with no query gives the defaults', () => {
  assert.deepEqual(parseState(''), DEFAULT_STATE);
  assert.deepEqual(DEFAULT_STATE.fuels, ['kerosene', 'diesel', 'e85']);
  assert.equal(DEFAULT_STATE.radius, 25);
});

test('parseState reads a shared link', () => {
  const s = parseState('?q=Round+Rock%2C+TX&lat=30.5083&lng=-97.6789&fuels=kerosene,e85&r=50&sort=price&station=osm-n12');
  assert.deepEqual(s, {
    q: 'Round Rock, TX',
    lat: 30.5083,
    lng: -97.6789,
    fuels: ['kerosene', 'e85'],
    radius: 50,
    sort: 'price',
    station: 'osm-n12',
  });
});

test('parseState rejects bad values and falls back per field', () => {
  const s = parseState('?lat=999&lng=-97&fuels=jet,plutonium&r=7&sort=evil&station=<script>');
  assert.equal(s.lat, DEFAULT_STATE.lat);
  assert.equal(s.lng, DEFAULT_STATE.lng);
  assert.deepEqual(s.fuels, DEFAULT_STATE.fuels);
  assert.equal(s.radius, 25);
  assert.equal(s.sort, 'distance');
  assert.equal(s.station, null);
});

test('parseState needs both coordinates to move the search', () => {
  const s = parseState('?lat=40&q=Somewhere');
  assert.equal(s.lat, DEFAULT_STATE.lat);
  assert.equal(s.q, DEFAULT_STATE.q);
});

test('parseState keeps an explicit empty fuel choice and dedupes', () => {
  assert.deepEqual(parseState('?fuels=none').fuels, []);
  assert.deepEqual(parseState('?fuels=diesel,diesel').fuels, ['diesel']);
});

test('parseState caps the search text', () => {
  const s = parseState(`?q=${'a'.repeat(200)}&lat=30&lng=-97`);
  assert.equal(s.q.length, 80);
});

test('serializeState round-trips and leaves out defaults', () => {
  const state = { ...DEFAULT_STATE, q: 'Denver, CO', lat: 39.7392, lng: -104.9903, fuels: ['e85'], radius: 10 };
  const qs = serializeState(state);
  assert.deepEqual(parseState(qs), { ...state, station: null });
  assert.ok(!qs.includes('sort='), 'default sort is not written');
  assert.equal(serializeState(DEFAULT_STATE), '');
  assert.ok(serializeState({ ...DEFAULT_STATE, fuels: [] }).includes('fuels=none'));
});
