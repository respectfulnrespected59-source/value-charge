import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  directionsUrl, escapeHtml, formatAddress, formatHours, formatMiles, formatMoney, formatPhone, formatVerified,
  sourceUrl,
} from '../../public/js/lib/format.js';

test('escapeHtml neutralises markup from map data', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml("Bob's & Sons"), 'Bob&#39;s &amp; Sons');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(3.5), '3.5');
});

test('formatHours reads the common OpenStreetMap patterns', () => {
  assert.equal(formatHours('24/7'), 'Open 24 hours');
  assert.equal(formatHours('Mo-Su 00:00-24:00'), 'Open 24 hours');
  assert.equal(formatHours('Mo-Su 06:00-22:00'), 'Daily 6 AM–10 PM');
  assert.equal(formatHours('Mo-Fr 05:30-23:00; Sa,Su 07:00-21:00'), 'Mon–Fri 5:30 AM–11 PM · Sat, Sun 7 AM–9 PM');
  assert.equal(formatHours('Mo-Su 05:00-24:00'), 'Daily 5 AM–midnight');
  assert.equal(formatHours('Mo-Sa 12:00-20:00'), 'Mon–Sat noon–8 PM');
  assert.equal(formatHours('06:00-22:00'), 'Daily 6 AM–10 PM');
});

test('formatHours reads DOE text and passes anything unusual through untouched', () => {
  assert.equal(formatHours('24 hours daily'), 'Open 24 hours');
  assert.equal(formatHours('7am-10pm daily'), '7am-10pm daily');
  assert.equal(formatHours('Mo-Fr 06:00-22:00; PH off'), 'Mo-Fr 06:00-22:00; PH off');
  assert.equal(formatHours(''), '');
  assert.equal(formatHours(undefined), '');
});

test('formatPhone gives a readable number and a dialable link, or nothing', () => {
  assert.deepEqual(formatPhone('+1-512-243-1834'), { display: '(512) 243-1834', tel: '+15122431834' });
  assert.deepEqual(formatPhone('605-886-5829'), { display: '(605) 886-5829', tel: '+16058865829' });
  assert.equal(formatPhone('12345'), null);
  assert.equal(formatPhone(''), null);
});

test('formatAddress joins the parts that exist', () => {
  assert.equal(formatAddress({ street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }), '1 Main St, Austin, TX 78701');
  assert.equal(formatAddress({ city: 'Austin', state: 'TX' }), 'Austin, TX');
  assert.equal(formatAddress({}), '');
});

test('formatMiles, formatMoney and formatVerified', () => {
  assert.equal(formatMiles(0.04), '0.0 mi');
  assert.equal(formatMiles(3.04), '3.0 mi');
  assert.equal(formatMiles(123.4), '123 mi');
  assert.equal(formatMoney(3.6), '$3.60');
  assert.equal(formatMoney(1234.5), '$1,234.50');
  assert.equal(formatVerified('2026-08-11'), 'Aug 2026');
  assert.equal(formatVerified('nope'), '');
});

test('directionsUrl and sourceUrl point at real pages', () => {
  assert.equal(directionsUrl({ lat: 30.1303, lng: -97.6437 }),
    'https://www.google.com/maps/dir/?api=1&destination=30.1303%2C-97.6437');
  assert.equal(sourceUrl({ osm: 'node/11147629900' }), 'https://www.openstreetmap.org/node/11147629900');
  assert.equal(sourceUrl({ doe: 1447 }), 'https://afdc.energy.gov/stations');
  assert.equal(sourceUrl({ osm: 'javascript:alert(1)' }), '');
});
