// The search lives in the address bar, so a link shares exactly what you see.
// Every field is checked on the way in; a bad value falls back to its default.
import { cleanText, FUELS, isValidCoord, round4 } from './normalize.js';

export const RADII = Object.freeze([5, 10, 25, 50, 100]);
export const SORTS = Object.freeze(['distance', 'price', 'name']);
export const STATION_ID = /^(osm-[nwr]\d{1,12}|doe-\d{1,9})$/;
const MAX_QUERY = 80;
const NO_FUELS = 'none';

export const DEFAULT_STATE = Object.freeze({
  q: 'Austin, TX',
  lat: 30.2672,
  lng: -97.7431,
  fuels: Object.freeze([...FUELS]),
  radius: 25,
  sort: 'distance',
  station: null,
});

const toNumber = (value) => (value === null || value === '' ? Number.NaN : Number(value));

function parseFuels(raw) {
  if (raw === null) return [...DEFAULT_STATE.fuels];
  if (raw === NO_FUELS) return [];
  const asked = raw.split(',');
  const picked = FUELS.filter((fuel) => asked.includes(fuel));
  return picked.length ? picked : [...DEFAULT_STATE.fuels];
}

export function parseState(search) {
  const params = new URLSearchParams(search);
  const lat = toNumber(params.get('lat'));
  const lng = toNumber(params.get('lng'));
  const hasPlace = isValidCoord(lat, lng);
  const radius = Number(params.get('r'));
  const sort = params.get('sort');
  const station = params.get('station');
  return {
    q: hasPlace ? cleanText(params.get('q'), MAX_QUERY) || 'Shared location' : DEFAULT_STATE.q,
    lat: hasPlace ? round4(lat) : DEFAULT_STATE.lat,
    lng: hasPlace ? round4(lng) : DEFAULT_STATE.lng,
    fuels: parseFuels(params.get('fuels')),
    radius: RADII.includes(radius) ? radius : DEFAULT_STATE.radius,
    sort: SORTS.includes(sort) ? sort : DEFAULT_STATE.sort,
    station: STATION_ID.test(station || '') ? station : null,
  };
}

const sameFuels = (a, b) => a.length === b.length && a.every((fuel, i) => fuel === b[i]);

/** State -> "?q=...&lat=..." with defaults left out ("" when everything is default). */
export function serializeState(state) {
  const params = new URLSearchParams();
  const moved = state.q !== DEFAULT_STATE.q || state.lat !== DEFAULT_STATE.lat || state.lng !== DEFAULT_STATE.lng;
  if (moved) {
    params.set('q', state.q);
    params.set('lat', String(round4(state.lat)));
    params.set('lng', String(round4(state.lng)));
  }
  if (!sameFuels(state.fuels, DEFAULT_STATE.fuels)) {
    params.set('fuels', state.fuels.length ? state.fuels.join(',') : NO_FUELS);
  }
  if (state.radius !== DEFAULT_STATE.radius) params.set('r', String(state.radius));
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort);
  if (state.station) params.set('station', state.station);
  const query = params.toString();
  return query ? `?${query}` : '';
}
