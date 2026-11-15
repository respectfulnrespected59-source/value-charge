import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterStations, sortStations } from '../../public/js/lib/query.js';

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const stations = [
  { id: 'osm-n1', name: 'Zed Fuel', lat: 30.2700, lng: -97.7400, fuels: ['diesel'] },
  { id: 'osm-n2', name: 'Alpha Stop', lat: 30.3500, lng: -97.7400, fuels: ['kerosene', 'diesel'] },
  { id: 'doe-3', name: 'Mid Market', lat: 30.3000, lng: -97.7431, fuels: ['e85'] },
  { id: 'osm-n4', name: 'Far Away', lat: 31.5000, lng: -97.7431, fuels: ['diesel', 'e85'] },
];

test('filterStations keeps stations inside the radius that carry a selected fuel, with distance', () => {
  const out = filterStations(stations, { center: AUSTIN, radius: 25, fuels: ['kerosene', 'diesel', 'e85'] });
  assert.deepEqual(out.map((s) => s.id).sort(), ['doe-3', 'osm-n1', 'osm-n2']);
  assert.ok(out.every((s) => typeof s.distance === 'number' && s.distance <= 25));
});

test('filterStations with one fuel drops stations that lack it', () => {
  const out = filterStations(stations, { center: AUSTIN, radius: 25, fuels: ['kerosene'] });
  assert.deepEqual(out.map((s) => s.id), ['osm-n2']);
});

test('filterStations with no fuel selected returns nothing', () => {
  assert.deepEqual(filterStations(stations, { center: AUSTIN, radius: 25, fuels: [] }), []);
});

test('filterStations does not mutate the station records', () => {
  filterStations(stations, { center: AUSTIN, radius: 100, fuels: ['diesel'] });
  assert.equal(stations[0].distance, undefined);
});

test('sortStations orders by distance, by name, or by your logged price', () => {
  const list = filterStations(stations, { center: AUSTIN, radius: 25, fuels: ['kerosene', 'diesel', 'e85'] });
  assert.deepEqual(sortStations(list, 'distance').map((s) => s.id), ['osm-n1', 'doe-3', 'osm-n2']);
  assert.deepEqual(sortStations(list, 'name').map((s) => s.id), ['osm-n2', 'doe-3', 'osm-n1']);

  const prices = { 'osm-n2': { diesel: { price: 3.49 } }, 'doe-3': { e85: { price: 2.89 } } };
  const byPrice = sortStations(list, 'price', { prices, fuels: ['diesel', 'e85'] });
  assert.deepEqual(byPrice.map((s) => s.id), ['doe-3', 'osm-n2', 'osm-n1'], 'priced first, cheapest first, then nearest');
});

test('sortStations ignores logged prices for fuels that are filtered out', () => {
  const list = filterStations(stations, { center: AUSTIN, radius: 25, fuels: ['diesel'] });
  const prices = { 'osm-n1': { e85: { price: 1.0 } }, 'osm-n2': { diesel: { price: 3.49 } } };
  assert.deepEqual(sortStations(list, 'price', { prices, fuels: ['diesel'] }).map((s) => s.id), ['osm-n2', 'osm-n1']);
});

test('sortStations returns a new array', () => {
  const list = filterStations(stations, { center: AUSTIN, radius: 25, fuels: ['diesel'] });
  const sorted = sortStations(list, 'name');
  assert.notEqual(sorted, list);
});
