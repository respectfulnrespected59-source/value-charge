import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailHtml, emptyHtml, resultsSummary, stationCard } from '../../public/js/lib/render.js';

const evil = '<img src=x onerror="alert(1)">';
const station = {
  id: 'osm-n7', name: 'Black Star Depot', brand: 'Valero', street: '2501 E 5th St', city: 'Austin', state: 'TX',
  zip: '78702', lat: 30.2637, lng: -97.7138, hours: 'Mo-Su 06:00-22:00', phone: '+1-512-555-0100',
  fuels: ['diesel', 'e85'], osm: 'node/7', doe: 99, verified: '2026-08-11', distance: 1.94,
};
const hostile = { ...station, name: evil, brand: evil, street: evil, city: evil, hours: evil };

test('stationCard shows the number, name, place, hours, distance and fuels', () => {
  const html = stationCard(station, { index: 3 });
  assert.match(html, /class="station-index">3</);
  assert.match(html, /Black Star Depot/);
  assert.match(html, /Austin, TX · Daily 6 AM–10 PM/);
  assert.match(html, /1\.9 mi/);
  assert.match(html, /<b>D<\/b>/);
  assert.match(html, /<b>E85<\/b>/);
  assert.match(html, /aria-pressed="false">☆</);
});

test('stationCard falls back to the street when the city is missing', () => {
  const html = stationCard({ ...station, city: undefined, state: undefined, hours: undefined }, { index: 1 });
  assert.match(html, /<span>2501 E 5th St<\/span>/);
  const bare = stationCard({ id: 'osm-n1', name: 'X', lat: 1, lng: 1, fuels: ['diesel'] }, { index: 1 });
  assert.match(bare, /Address not listed/);
});

test('stationCard marks saved and selected stations and shows your logged price', () => {
  const html = stationCard(station, { index: 1, selected: true, saved: true, prices: { 'osm-n7': { diesel: { price: 3.6, at: '2026-11-15' } } } });
  assert.match(html, /station-card is-selected/);
  assert.match(html, /aria-pressed="true">★</);
  assert.match(html, /<b>D<\/b> \$3\.60/);
});

test('nothing from map data can inject markup into the card or the detail panel', () => {
  for (const html of [stationCard(hostile, { index: 1 }), detailHtml(hostile, {})]) {
    assert.ok(!html.includes('<img'), 'raw tag leaked');
    assert.ok(!/onerror="/.test(html), 'raw attribute leaked');
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  }
});

test('detailHtml carries the actions, phone, source and verified date', () => {
  const html = detailHtml(station, { saved: false });
  assert.match(html, /<h2 id="detailTitle">Black Star Depot<\/h2>/);
  assert.match(html, /Valero/);
  assert.match(html, /2501 E 5th St, Austin, TX 78702 · Daily 6 AM–10 PM/);
  assert.match(html, /href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=30\.2637%2C-97\.7138"/);
  assert.match(html, /href="tel:\+15125550100">Call \(512\) 555-0100</);
  assert.match(html, /DOE verified Aug 2026/);
  assert.match(html, /Listed on OpenStreetMap/);
  assert.match(html, /OpenStreetMap contributors \+ U\.S\. Dept\. of Energy \(E85 verified Aug 2026\)/);
  assert.match(html, /href="https:\/\/www\.openstreetmap\.org\/node\/7" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /data-plan="osm-n7"/);
  assert.match(html, /☆ Save/);
});

test('detailHtml shows your logged price with a remove button, and copes with a bare listing', () => {
  const html = detailHtml(station, { saved: true, prices: { 'osm-n7': { e85: { price: 2.89, at: '2026-11-15' } } } });
  assert.match(html, /\$2\.89 <small>\/gal · you, Nov 15<\/small>/);
  assert.match(html, /data-clear-price="e85"/);
  assert.match(html, /★ Saved/);
  const bare = detailHtml({ id: 'doe-5', name: 'Lone Pump', lat: 40, lng: -90, fuels: ['e85'], doe: 5 }, {});
  assert.match(bare, /Street address not listed/);
  assert.match(bare, /U\.S\. DOE list/);
  assert.ok(!bare.includes('tel:'));
  assert.ok(!bare.includes('detail-distance'));
});

test('emptyHtml explains each empty case and offers the next step', () => {
  assert.match(emptyHtml({ savedOnly: true, fuels: [], radius: 25 }), /No saved stops yet[\s\S]*data-show-all/);
  assert.match(emptyHtml({ savedOnly: false, fuels: [], radius: 25 }), /Pick a fuel[\s\S]*data-all-fuels/);
  const kero = emptyHtml({ savedOnly: false, fuels: ['kerosene'], radius: 25 });
  assert.match(kero, /No Kerosene within 25 mi/);
  assert.match(kero, /data-radius="50"/);
  assert.match(kero, /data-radius="100"/);
  assert.match(kero, /hardware and farm stores/);
  const both = emptyHtml({ savedOnly: false, fuels: ['diesel', 'e85'], radius: 100 });
  assert.match(both, /No Diesel or E85 within 100 mi/);
  assert.ok(!both.includes('data-radius'), 'no wider option past 100 mi');
});

test('resultsSummary reads naturally', () => {
  assert.equal(resultsSummary(1, { savedOnly: false, radius: 25 }), '1 station · 25 mi');
  assert.equal(resultsSummary(1402, { savedOnly: false, radius: 50 }), '1,402 stations · 50 mi');
  assert.equal(resultsSummary(2, { savedOnly: true, radius: 25 }), '2 saved');
});
