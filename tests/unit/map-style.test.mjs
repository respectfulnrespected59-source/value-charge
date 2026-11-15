import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brandStyle, MAP_COLORS } from '../../public/js/lib/map-style.js';

const sample = () => ({
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    { id: 'water', type: 'fill', paint: { 'fill-color': '#c4dff6' } },
    { id: 'park', type: 'fill', paint: { 'fill-color': '#d8e8c8' } },
    { id: 'road_motorway', type: 'line', paint: { 'line-color': '#fc8', 'line-width': 2 } },
    { id: 'road_motorway_casing', type: 'line', paint: { 'line-color': '#e9ac77' } },
    { id: 'building', type: 'fill', paint: { 'fill-color': '#dfdbd7' } },
    { id: 'building-3d', type: 'fill-extrusion', paint: {} },
    { id: 'poi_r20', type: 'symbol', layout: { 'text-field': '{name}' }, paint: {} },
    { id: 'label_city', type: 'symbol', layout: { 'text-field': '{name}' }, paint: { 'text-color': '#333' } },
    { id: 'waterway_river', type: 'line', paint: { 'line-color': '#a0c8f0' } },
  ],
});

test('brandStyle recolours land, water, roads and labels to the VALUE CHARGE palette', () => {
  const style = brandStyle(sample());
  const paint = (id) => style.layers.find((l) => l.id === id).paint;
  assert.equal(paint('background')['background-color'], MAP_COLORS.land);
  assert.equal(paint('water')['fill-color'], MAP_COLORS.water);
  assert.equal(paint('waterway_river')['line-color'], MAP_COLORS.water);
  assert.equal(paint('park')['fill-color'], MAP_COLORS.park);
  assert.equal(paint('road_motorway')['line-color'], MAP_COLORS.road);
  assert.equal(paint('road_motorway')['line-width'], 2, 'other paint values survive');
  assert.equal(paint('road_motorway_casing')['line-color'], MAP_COLORS.roadCasing);
  assert.equal(paint('label_city')['text-color'], MAP_COLORS.label);
});

test('brandStyle drops 3D buildings and shop icons so stations stand out', () => {
  const ids = brandStyle(sample()).layers.map((l) => l.id);
  assert.ok(!ids.includes('building-3d'));
  assert.ok(!ids.includes('poi_r20'));
  assert.ok(ids.includes('label_city'));
});

test('brandStyle returns a new style and leaves the original alone', () => {
  const original = sample();
  const before = JSON.stringify(original);
  const out = brandStyle(original);
  assert.notEqual(out, original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(out.sources.openmaptiles.url, 'https://tiles.openfreemap.org/planet');
});

test('brandStyle leaves no original road, water or land colour in the real OpenFreeMap positron style', () => {
  const real = JSON.parse(readFileSync(new URL('../fixtures/positron.json', import.meta.url), 'utf8'));
  const style = brandStyle(real);
  const brand = new Set(Object.values(MAP_COLORS));
  const recoloured = style.layers.filter((l) => ['background', 'fill', 'line'].includes(l.type));
  assert.ok(recoloured.length > 30, 'the fixture is the full style');
  for (const layer of recoloured) {
    const key = { background: 'background-color', fill: 'fill-color', line: 'line-color' }[layer.type];
    assert.ok(brand.has(layer.paint[key]), `${layer.id} kept ${JSON.stringify(layer.paint[key])}`);
  }
  assert.ok(!style.layers.some((l) => l.id.startsWith('aeroway')), 'runway lines dropped');
  assert.ok(style.layers.some((l) => l.id === 'label_city'), 'city names kept');
});

test('brandStyle rejects something that is not a map style', () => {
  assert.throws(() => brandStyle({}), /style/);
  assert.throws(() => brandStyle(null), /style/);
});
