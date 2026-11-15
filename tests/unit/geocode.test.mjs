import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuery, createGeocoder, GeocodeError } from '../../public/js/lib/geocode.js';

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const nominatimRoundRock = [{
  lat: '30.5085915',
  lon: '-97.6788056',
  name: 'Round Rock',
  address: { city: 'Round Rock', state: 'Texas', 'ISO3166-2-lvl4': 'US-TX', country_code: 'us' },
}];
const nominatimZip = [{
  lat: '30.4868503',
  lon: '-97.6497635',
  name: '78664',
  address: { postcode: '78664', city: 'Round Rock', 'ISO3166-2-lvl4': 'US-TX', country_code: 'us' },
}];
const photonRoundRock = {
  features: [
    { properties: { name: 'Roundrock', countrycode: 'CA', state: 'Ontario' }, geometry: { coordinates: [-79, 44] } },
    {
      properties: { name: 'Round Rock', countrycode: 'US', state: 'Texas', type: 'city' },
      geometry: { coordinates: [-97.6788056, 30.5085915] },
    },
  ],
};

test('classifyQuery spots ZIP codes, places and blanks', () => {
  assert.deepEqual(classifyQuery(' 78664 '), { kind: 'zip', zip: '78664' });
  assert.deepEqual(classifyQuery('78664-1234'), { kind: 'zip', zip: '78664' });
  assert.deepEqual(classifyQuery('  Round   Rock, TX '), { kind: 'place', text: 'Round Rock, TX' });
  assert.deepEqual(classifyQuery('   '), { kind: 'empty' });
});

test('geocode asks Nominatim for US places and builds a short label', async () => {
  const calls = [];
  const geocoder = createGeocoder({ fetchImpl: async (url) => { calls.push(String(url)); return json(nominatimRoundRock); } });
  const place = await geocoder.geocode('Round Rock, TX');
  assert.deepEqual(place, { label: 'Round Rock, TX', lat: 30.5086, lng: -97.6788 });
  assert.match(calls[0], /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(calls[0], /countrycodes=us/);
  assert.match(calls[0], /q=Round\+Rock%2C\+TX/);
});

test('geocode sends ZIP codes as a postal code search', async () => {
  const calls = [];
  const geocoder = createGeocoder({ fetchImpl: async (url) => { calls.push(String(url)); return json(nominatimZip); } });
  const place = await geocoder.geocode('78664');
  assert.equal(place.label, '78664 · Round Rock, TX');
  assert.match(calls[0], /postalcode=78664/);
});

test('geocode falls back to Photon when Nominatim is down, keeping US results only', async () => {
  const geocoder = createGeocoder({
    fetchImpl: async (url) => (String(url).includes('nominatim') ? json({}, 503) : json(photonRoundRock)),
    onError: () => {},
  });
  assert.deepEqual(await geocoder.geocode('Round Rock'), { label: 'Round Rock, TX', lat: 30.5086, lng: -97.6788 });
});

test('geocode falls back to Photon when Nominatim throws, and reports the failure', async () => {
  const reported = [];
  const geocoder = createGeocoder({
    fetchImpl: async (url) => {
      if (String(url).includes('nominatim')) throw new TypeError('Failed to fetch');
      return json(photonRoundRock);
    },
    onError: (service, err) => reported.push(`${service}: ${err.message}`),
  });
  assert.equal((await geocoder.geocode('Round Rock')).label, 'Round Rock, TX');
  assert.deepEqual(reported, ['Nominatim: Failed to fetch'], 'a failure is never swallowed silently');
});

test('geocode reports not-found when both services answer with nothing in the US', async () => {
  const geocoder = createGeocoder({
    fetchImpl: async (url) => (String(url).includes('nominatim') ? json([]) : json({ features: [photonRoundRock.features[0]] })),
  });
  await assert.rejects(geocoder.geocode('Roundrock Ontario'), (err) => err instanceof GeocodeError && err.code === 'not-found');
});

test('geocode reports unavailable when both services fail', async () => {
  const geocoder = createGeocoder({ fetchImpl: async () => json({}, 500), onError: () => {} });
  await assert.rejects(geocoder.geocode('Austin'), (err) => err instanceof GeocodeError && err.code === 'unavailable');
});

test('geocode refuses an empty search without calling anyone', async () => {
  let called = false;
  const geocoder = createGeocoder({ fetchImpl: async () => { called = true; return json([]); } });
  await assert.rejects(geocoder.geocode('  '), (err) => err.code === 'empty');
  assert.equal(called, false);
});

test('geocode remembers answers so a repeat search makes no call', async () => {
  let calls = 0;
  const geocoder = createGeocoder({ fetchImpl: async () => { calls += 1; return json(nominatimRoundRock); } });
  await geocoder.geocode('Round Rock, TX');
  await geocoder.geocode('round rock, tx');
  assert.equal(calls, 1);
});

test('geocode ignores answers with broken coordinates', async () => {
  const geocoder = createGeocoder({
    fetchImpl: async (url) => (String(url).includes('nominatim') ? json([{ lat: 'x', lon: 'y', name: 'Bad' }]) : json({ features: [] })),
  });
  await assert.rejects(geocoder.geocode('Bad'), (err) => err.code === 'not-found');
});
