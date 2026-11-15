// The live station map: MapLibre GL (self-hosted ES module build) over the OpenFreeMap
// "positron" vector style, recoloured to the VALUE CHARGE palette.
// Loaded after the list renders, so the stations show up before the map engine does.
import { boundsForRadius, circlePolygon } from '../lib/geo.js';
import { brandStyle } from '../lib/map-style.js';

const MAPLIBRE_VERSION = '6.18.0';
const VENDOR = `vendor/maplibre-gl-${MAPLIBRE_VERSION}/`;
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_TIMEOUT_MS = 10000;
const LOAD_TIMEOUT_MS = 20000;
const NUMBERED = 50; // matches the list page size: dot numbers = card numbers
const TONE_ORDER = ['kerosene', 'e85', 'diesel']; // a multi-fuel stop shows its rarest fuel
const COLORS = Object.freeze({
  navy: '#081826', gold: '#d9aa45', orange: '#cf5b2e', black: '#07090b', cream: '#fff4e8',
  kerosene: '#d9aa45', e85: '#e26b38', diesel: '#ffe0ca',
});
const EMPTY = Object.freeze({ type: 'FeatureCollection', features: [] });
const FONT = ['Noto Sans Bold'];
const HIT_PX = 12; // a finger is wider than a dot
const subtract = (a, b) => [a.x - b.x, a.y - b.y];

// MapLibre 6 is an ES module (same origin, so CSP script-src 'self' allows it). Its worker runs as a module
// worker from our own file (worker-src 'self'): no blob: URL, no eval.
async function loadEngine() {
  const url = (file) => new URL(`${VENDOR}${file}`, document.baseURI).href;
  const maplibregl = await import(url('maplibre-gl.js'));
  maplibregl.setWorkerUrl(url('maplibre-gl-worker.js'));
  return maplibregl;
}

function loadCss(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

async function loadStyle() {
  const res = await fetch(STYLE_URL, { signal: AbortSignal.timeout(STYLE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`map style answered ${res.status}`);
  return brandStyle(await res.json());
}

function toFeature(station, index, fuels) {
  const tone = TONE_ORDER.find((f) => station.fuels.includes(f) && fuels.includes(f)) || station.fuels[0];
  const properties = { id: station.id, name: station.name, tone };
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
    properties: index < NUMBERED ? { ...properties, n: index + 1 } : properties,
  };
}

function addLayers(map) {
  for (const id of ['radius', 'center', 'stations']) map.addSource(id, { type: 'geojson', data: EMPTY });
  const ring = ['match', ['get', 'tone'], 'kerosene', COLORS.kerosene, 'e85', COLORS.e85, COLORS.diesel];
  const none = ['==', ['get', 'id'], ''];
  map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': COLORS.navy, 'fill-opacity': 0.06 } });
  map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': COLORS.orange, 'line-width': 2, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'center-dot', type: 'circle', source: 'center', paint: { 'circle-radius': 7, 'circle-color': COLORS.cream, 'circle-stroke-color': COLORS.orange, 'circle-stroke-width': 3 } });
  map.addLayer({
    id: 'station-dot', type: 'circle', source: 'stations',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 7, 11, 10],
      'circle-color': COLORS.navy,
      'circle-stroke-color': ring,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 9, 3],
    },
  });
  map.addLayer({
    id: 'station-num', type: 'symbol', source: 'stations', filter: ['has', 'n'], minzoom: 8,
    layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT, 'text-size': 10, 'text-allow-overlap': true },
    paint: { 'text-color': COLORS.diesel },
  });
  map.addLayer({ id: 'station-selected', type: 'circle', source: 'stations', filter: none, paint: { 'circle-radius': 13, 'circle-color': COLORS.gold, 'circle-stroke-color': COLORS.navy, 'circle-stroke-width': 3 } });
  map.addLayer({
    id: 'station-selected-num', type: 'symbol', source: 'stations', filter: ['all', none, ['has', 'n']],
    layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': COLORS.black },
  });
}

function wireEvents(maplibregl, map, onSelect) {
  const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'vc-popup' });
  // Where dots overlap, the tap goes to the dot whose centre is nearest the finger,
  // not to whichever happens to be drawn on top.
  // One map-wide handler, not one per layer: the gold "selected" ring covers its neighbours,
  // and a per-layer handler on it re-selected the old station after a neighbour was tapped.
  map.on('click', (event) => {
    const { x, y } = event.point;
    const box = [[x - HIT_PX, y - HIT_PX], [x + HIT_PX, y + HIT_PX]];
    const nearest = map.queryRenderedFeatures(box, { layers: ['station-dot'] })
      .map((f) => ({ id: f.properties.id, d: Math.hypot(...subtract(map.project(f.geometry.coordinates), event.point)) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest) onSelect(nearest.id);
  });
  for (const layer of ['station-dot', 'station-selected']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; tip.remove(); });
  }
  map.on('mousemove', 'station-dot', (event) => {
    const feature = event.features?.[0];
    if (feature) tip.setLngLat(feature.geometry.coordinates).setText(feature.properties.name).addTo(map);
  });
}

function createView(map, container) {
  let lastKey = '';
  function setStations(stations, fuels) {
    const key = `${fuels.join()}|${stations.map((s) => s.id).join()}`;
    if (key === lastKey) return;
    lastKey = key;
    map.getSource('stations').setData({ type: 'FeatureCollection', features: stations.map((s, i) => toFeature(s, i, fuels)) });
  }
  function setSelected(id) {
    const match = ['==', ['get', 'id'], id || ''];
    map.setFilter('station-selected', match);
    map.setFilter('station-selected-num', ['all', match, ['has', 'n']]);
  }
  let lastArea = '';
  function setArea(place, radius) {
    const key = `${place.lat},${place.lng},${radius}`;
    if (key === lastArea) return;
    lastArea = key;
    map.getSource('radius').setData(radius ? { type: 'Feature', properties: {}, geometry: circlePolygon(place, radius) } : EMPTY);
    map.getSource('center').setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [place.lng, place.lat] } });
  }
  return {
    map,
    update({ stations, selectedId, place, radius, fuels }) {
      setStations(stations, fuels);
      setSelected(selectedId);
      setArea(place, radius);
      container.dataset.count = String(stations.length);
      container.dataset.selected = selectedId || '';
    },
    focus(station) {
      const inView = map.getBounds().contains([station.lng, station.lat]);
      if (inView && map.getZoom() >= 10) return;
      map.easeTo({ center: [station.lng, station.lat], zoom: Math.max(map.getZoom(), 12), duration: 500 });
    },
    fitRadius(place, radius) {
      map.fitBounds(boundsForRadius(place, radius), { padding: 24, duration: 600, maxZoom: 13 });
    },
  };
}

/** Resolves to a map view, or rejects when this device cannot show the map. */
export async function createMapView(container, { center, radius, onSelect }) {
  if (!hasWebGL()) throw new Error('WebGL is not available');
  loadCss(`${VENDOR}maplibre-gl.css`);
  const [style, maplibregl] = await Promise.all([loadStyle(), loadEngine()]);
  const map = new maplibregl.Map({
    container,
    style,
    bounds: boundsForRadius(center, radius),
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  // A failed tile or sprite is logged, not fatal: MapLibre carries on and still fires 'load'.
  map.on('error', (event) => console.error('[value-charge] map:', event.error?.message || event));
  window.__vcMap = map; // read-only handle for tests and debugging
  try {
    await withTimeout(new Promise((resolve) => { map.once('load', resolve); }), LOAD_TIMEOUT_MS, 'map load');
  } catch (err) {
    map.remove();
    delete window.__vcMap;
    throw err;
  }
  addLayers(map);
  wireEvents(maplibregl, map, onSelect);
  container.dataset.ready = 'true';
  return createView(map, container);
}
