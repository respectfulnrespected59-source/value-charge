import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, mergeStations, normalizeAfdc, normalizeOsm } from '../../public/js/lib/normalize.js';

const osmNode = {
  type: 'node',
  id: 11147629900,
  lat: 30.130297,
  lon: -97.6436992,
  tags: {
    amenity: 'fuel',
    name: 'Exxon',
    brand: 'Exxon',
    'addr:housenumber': '13000',
    'addr:street': 'Farm-to-Market Road 812',
    'addr:city': 'Del Valle',
    'addr:state': 'TX',
    'addr:postcode': '78617',
    'fuel:diesel': 'yes',
    opening_hours: '24/7',
    phone: '+1-512-243-1834',
  },
};

const afdcRecord = {
  id: 1447,
  station_name: 'Sioux Valley Co-op - Cenex',
  street_address: '220 10th St NW',
  city: 'Watertown',
  state: 'SD',
  zip: '57201',
  latitude: 44.904113,
  longitude: -97.130798,
  access_days_time: '24 hours daily',
  station_phone: '605-886-5829',
  date_last_confirmed: '2026-08-11',
};

test('cleanText trims, collapses whitespace, strips control characters and caps length', () => {
  assert.equal(cleanText('  Black \n Star\tDepot  '), 'Black Star Depot');
  assert.equal(cleanText('bad\u0000\u0007name'), 'badname');
  assert.equal(cleanText('x'.repeat(300)).length, 120);
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText(42), '42');
});

test('normalizeOsm keeps the fields the app shows', () => {
  const s = normalizeOsm(osmNode);
  assert.deepEqual(s, {
    id: 'osm-n11147629900',
    name: 'Exxon',
    street: '13000 Farm-to-Market Road 812',
    city: 'Del Valle',
    state: 'TX',
    zip: '78617',
    lat: 30.1303,
    lng: -97.6437,
    hours: '24/7',
    phone: '+1-512-243-1834',
    fuels: ['diesel'],
    osm: 'node/11147629900',
  });
});

test('normalizeOsm keeps a brand only when it differs from the name', () => {
  const s = normalizeOsm({ ...osmNode, tags: { ...osmNode.tags, name: 'Corner Mart', brand: 'Shell' } });
  assert.equal(s.name, 'Corner Mart');
  assert.equal(s.brand, 'Shell');
});

test('normalizeOsm reads way centers, HGV diesel, kerosene and E85', () => {
  const s = normalizeOsm({
    type: 'way',
    id: 5,
    center: { lat: 40.1, lon: -88.2 },
    tags: { amenity: 'fuel', 'fuel:HGV_diesel': 'yes', 'fuel:kerosene': 'yes', 'fuel:e85': 'yes' },
  });
  assert.equal(s.id, 'osm-w5');
  assert.equal(s.osm, 'way/5');
  assert.deepEqual(s.fuels, ['kerosene', 'diesel', 'e85']);
  assert.equal(s.name, 'Fuel station');
  assert.equal(s.lat, 40.1);
});

test('normalizeOsm falls back to operator for the name', () => {
  const s = normalizeOsm({ ...osmNode, tags: { 'fuel:diesel': 'yes', operator: 'County Co-op' } });
  assert.equal(s.name, 'County Co-op');
});

test('normalizeOsm rejects stations with no coordinates, no listed fuel, or private access', () => {
  assert.equal(normalizeOsm({ ...osmNode, lat: undefined, lon: undefined }), null);
  assert.equal(normalizeOsm({ ...osmNode, tags: { name: 'x', 'fuel:diesel': 'no' } }), null);
  assert.equal(normalizeOsm({ ...osmNode, tags: { ...osmNode.tags, access: 'private' } }), null);
  assert.equal(normalizeOsm({ ...osmNode, lat: 95 }), null);
  assert.equal(normalizeOsm(null), null);
});

test('normalizeAfdc maps the DOE record and keeps the verified date', () => {
  assert.deepEqual(normalizeAfdc(afdcRecord), {
    id: 'doe-1447',
    name: 'Sioux Valley Co-op - Cenex',
    street: '220 10th St NW',
    city: 'Watertown',
    state: 'SD',
    zip: '57201',
    lat: 44.9041,
    lng: -97.1308,
    hours: '24 hours daily',
    phone: '605-886-5829',
    fuels: ['e85'],
    doe: 1447,
    verified: '2026-08-11',
  });
});

test('normalizeAfdc drops bad coordinates and malformed dates', () => {
  assert.equal(normalizeAfdc({ ...afdcRecord, latitude: null }), null);
  assert.equal(normalizeAfdc({ ...afdcRecord, date_last_confirmed: 'yesterday' }).verified, undefined);
  assert.equal(normalizeAfdc(undefined), null);
});

test('mergeStations folds a DOE E85 station into the OSM station at the same spot', () => {
  const osm = normalizeOsm(osmNode);
  const doe = normalizeAfdc({ ...afdcRecord, latitude: 30.1305, longitude: -97.6437, station_name: 'Exxon #12' });
  const merged = mergeStations([osm], [doe]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].fuels, ['diesel', 'e85']);
  assert.equal(merged[0].name, 'Exxon');
  assert.equal(merged[0].doe, 1447);
  assert.equal(merged[0].verified, '2026-08-11');
  assert.equal(merged[0].osm, 'node/11147629900');
});

test('mergeStations fills missing OSM details from the DOE record', () => {
  const bare = normalizeOsm({ type: 'node', id: 1, lat: 44.9041, lon: -97.1308, tags: { 'fuel:diesel': 'yes' } });
  const merged = mergeStations([bare], [normalizeAfdc(afdcRecord)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Sioux Valley Co-op - Cenex');
  assert.equal(merged[0].street, '220 10th St NW');
  assert.equal(merged[0].phone, '605-886-5829');
  assert.equal(merged[0].hours, '24 hours daily');
});

test('mergeStations keeps stations apart when they are more than a block away', () => {
  const osm = normalizeOsm(osmNode);
  const far = normalizeAfdc({ ...afdcRecord, latitude: 30.1403, longitude: -97.6437 });
  assert.equal(mergeStations([osm], [far]).length, 2);
});

test('mergeStations never merges one DOE station into two OSM stations', () => {
  const a = normalizeOsm(osmNode);
  const b = normalizeOsm({ ...osmNode, id: 2, lat: 30.1304 });
  const doe = normalizeAfdc({ ...afdcRecord, latitude: 30.1303, longitude: -97.6437 });
  const merged = mergeStations([a, b], [doe]);
  assert.equal(merged.filter((s) => s.doe === 1447).length, 1);
  assert.equal(merged.length, 2);
});

test('mergeStations does not mutate its inputs', () => {
  const osm = normalizeOsm(osmNode);
  const before = JSON.stringify(osm);
  mergeStations([osm], [normalizeAfdc({ ...afdcRecord, latitude: 30.1303, longitude: -97.6437 })]);
  assert.equal(JSON.stringify(osm), before);
});
