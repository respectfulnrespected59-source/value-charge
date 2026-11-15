import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEYS } from '../../public/js/lib/store.js';

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
    dump: () => Object.fromEntries(items),
  };
}

const station = {
  id: 'osm-n1', name: 'Black Star Depot', street: '2501 E 5th St', city: 'Austin', state: 'TX', zip: '78702',
  lat: 30.2637, lng: -97.7138, fuels: ['diesel'], hours: '24/7', phone: '+1-512-555-0100', osm: 'node/1',
  distance: 3.2,
};
const today = () => '2026-11-15';

test('toggleSaved saves a snapshot, persists it, and removes it again', () => {
  const storage = memoryStorage();
  const store = createStore(storage, today);
  assert.equal(store.toggleSaved(station), true);
  assert.equal(store.isSaved('osm-n1'), true);
  const saved = JSON.parse(storage.dump()[KEYS.saved]);
  assert.equal(saved['osm-n1'].name, 'Black Star Depot');
  assert.equal(saved['osm-n1'].savedAt, '2026-11-15');
  assert.equal(saved['osm-n1'].distance, undefined, 'distance depends on the search, so it is not stored');
  assert.equal(store.toggleSaved(station), false);
  assert.equal(store.isSaved('osm-n1'), false);
  assert.deepEqual(store.savedList(), []);
});

test('a new store reads what the last one saved', () => {
  const storage = memoryStorage();
  createStore(storage, today).toggleSaved(station);
  const again = createStore(storage, today);
  assert.equal(again.savedList().length, 1);
  assert.equal(again.savedList()[0].id, 'osm-n1');
});

test('tampered or broken storage is cleaned on load, never trusted', () => {
  const storage = memoryStorage({
    [KEYS.saved]: JSON.stringify({
      'osm-n1': { ...station, name: '<img src=x onerror=alert(1)>'.repeat(10) },
      'bad id': { ...station },
      'osm-n2': { ...station, lat: 'north' },
      'osm-n3': { ...station, fuels: ['jet'] },
      'osm-n4': 'not an object',
    }),
    [KEYS.prices]: '{not json',
  });
  const store = createStore(storage, today);
  const list = store.savedList();
  assert.deepEqual(list.map((s) => s.id), ['osm-n1']);
  assert.equal(list[0].name.length, 120, 'long names are capped');
  assert.equal(store.priceFor('osm-n1', 'diesel'), null);
});

test('valid JSON with hostile values in the price log is filtered entry by entry', () => {
  // A raw JSON string: in an object literal, __proto__ would set the prototype instead of a key.
  const raw = `{
    "osm-n1": { "diesel": { "price": 3.49, "at": "2026-11-01" }, "kerosene": { "price": "4.99", "at": "2026-11-01" } },
    "osm-n2": { "e85": { "price": 9999, "at": "2026-11-01" } },
    "osm-n3": { "diesel": { "price": 3.1, "at": "yesterday" } },
    "__proto__": { "diesel": { "price": 3, "at": "2026-11-01" } },
    "constructor": { "diesel": { "price": 3, "at": "2026-11-01" } },
    "osm-n4": ["not", "an", "object"],
    "osm-n5": { "jet": { "price": 3, "at": "2026-11-01" } }
  }`;
  assert.ok(Object.hasOwn(JSON.parse(raw), '__proto__'), 'the hostile key really is in the input');
  const store = createStore(memoryStorage({ [KEYS.prices]: raw }), today);
  assert.deepEqual(store.prices(), { 'osm-n1': { diesel: { price: 3.49, at: '2026-11-01' } } });
  assert.equal(({}).diesel, undefined, 'no prototype pollution');
});

test('reload picks up what another tab wrote, so saves are not overwritten', () => {
  const storage = memoryStorage();
  const tabA = createStore(storage, today);
  const tabB = createStore(storage, today);
  tabA.toggleSaved(station);
  tabB.reload();
  tabB.toggleSaved({ ...station, id: 'osm-n2', name: 'Second' });
  tabA.reload();
  assert.deepEqual(tabA.savedList().map((s) => s.id).sort(), ['osm-n1', 'osm-n2']);
});

test('toggleSaved refuses a station that fails validation and leaves storage alone', () => {
  const storage = memoryStorage();
  const store = createStore(storage, today);
  assert.equal(store.toggleSaved({ ...station, id: 'bad id' }), false);
  assert.equal(store.toggleSaved({ ...station, lat: 'north' }), false);
  assert.equal(storage.dump()[KEYS.saved], undefined);
});

test('logPrice keeps a valid price with the date and rejects nonsense', () => {
  const storage = memoryStorage();
  const store = createStore(storage, today);
  assert.equal(store.logPrice('osm-n1', 'diesel', 3.689), true);
  assert.deepEqual(store.priceFor('osm-n1', 'diesel'), { price: 3.69, at: '2026-11-15' });
  assert.equal(store.logPrice('osm-n1', 'diesel', 0), false);
  assert.equal(store.logPrice('osm-n1', 'diesel', 99), false);
  assert.equal(store.logPrice('osm-n1', 'jet', 3), false);
  assert.equal(store.logPrice('bad id', 'diesel', 3), false);
  assert.equal(store.logPrice('osm-n1', 'diesel', Number.NaN), false);
  assert.deepEqual(store.priceFor('osm-n1', 'diesel'), { price: 3.69, at: '2026-11-15' });
  assert.ok(storage.dump()[KEYS.prices].includes('3.69'));
});

test('clearPrice removes one fuel and prices() exposes a copy', () => {
  const store = createStore(memoryStorage(), today);
  store.logPrice('osm-n1', 'diesel', 3.5);
  store.logPrice('osm-n1', 'kerosene', 4.9);
  store.clearPrice('osm-n1', 'diesel');
  assert.equal(store.priceFor('osm-n1', 'diesel'), null);
  const copy = store.prices();
  copy['osm-n1'].kerosene.price = 0;
  assert.equal(store.priceFor('osm-n1', 'kerosene').price, 4.9, 'outside edits do not leak in');
});

test('lastSearch remembers a valid search only', () => {
  const store = createStore(memoryStorage(), today);
  assert.equal(store.lastSearch(), null);
  store.rememberSearch({ q: 'Denver, CO', lat: 39.74, lng: -104.99 });
  assert.deepEqual(store.lastSearch(), { q: 'Denver, CO', lat: 39.74, lng: -104.99 });
  store.rememberSearch({ q: 'x', lat: 'no', lng: 1 });
  assert.deepEqual(store.lastSearch(), { q: 'Denver, CO', lat: 39.74, lng: -104.99 });
});

test('a storage that throws (private mode) still works for the visit', () => {
  const broken = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const store = createStore(broken, today);
  assert.equal(store.toggleSaved(station), true);
  assert.equal(store.isSaved('osm-n1'), true);
  assert.equal(store.persistent, false);
});
