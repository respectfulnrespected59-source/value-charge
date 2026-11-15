// Turn raw OpenStreetMap and DOE records into one station shape, and merge the two.
// Both sources are outside data: every string is cleaned and capped here, and the
// UI still escapes it when it renders.
import { distanceMiles } from './geo.js';

export const FUELS = Object.freeze(['kerosene', 'diesel', 'e85']);
const MAX_TEXT = 120;
const MERGE_METERS = 120;
const METERS_PER_MILE = 1609.344;
const GRID = 0.01; // ~1.1 km cells for the merge lookup
const GENERIC_NAME = 'Fuel station';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function cleanText(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').replace(CONTROL_CHARS, '').trim().slice(0, max).trim();
}

export function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export const round4 = (n) => Math.round(n * 1e4) / 1e4;

// Drop empty fields so tiles stay small and "missing" has one meaning.
function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== '' && v !== undefined && v !== null));
}

const OSM_TYPES = { node: 'n', way: 'w', relation: 'r' };
const CLOSED_ACCESS = new Set(['private', 'no']);

function osmFuels(tags) {
  return FUELS.filter((fuel) => (fuel === 'diesel'
    ? tags['fuel:diesel'] === 'yes' || tags['fuel:HGV_diesel'] === 'yes'
    : tags[`fuel:${fuel}`] === 'yes'));
}

/** One Overpass element -> station, or null when it is unusable. */
export function normalizeOsm(element) {
  if (!element || typeof element !== 'object' || !element.tags) return null;
  const letter = OSM_TYPES[element.type];
  if (!letter || !Number.isSafeInteger(element.id)) return null;
  const tags = element.tags;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!isValidCoord(lat, lng) || CLOSED_ACCESS.has(tags.access)) return null;
  const fuels = osmFuels(tags);
  if (!fuels.length) return null;

  const name = cleanText(tags.name) || cleanText(tags.brand) || cleanText(tags.operator) || GENERIC_NAME;
  const brand = cleanText(tags.brand);
  return compact({
    id: `osm-${letter}${element.id}`,
    name,
    brand: brand !== name ? brand : '',
    street: cleanText([tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')),
    city: cleanText(tags['addr:city']),
    state: cleanText(tags['addr:state'], 20),
    zip: cleanText(tags['addr:postcode'], 10),
    lat: round4(lat),
    lng: round4(lng),
    hours: cleanText(tags.opening_hours),
    phone: cleanText(tags.phone || tags['contact:phone'], 40),
    fuels,
    osm: `${element.type}/${element.id}`,
  });
}

/** One DOE Alternative Fuels Data Center record -> station, or null. */
export function normalizeAfdc(record) {
  if (!record || typeof record !== 'object' || !Number.isSafeInteger(record.id)) return null;
  const { latitude: lat, longitude: lng } = record;
  if (!isValidCoord(lat, lng)) return null;
  return compact({
    id: `doe-${record.id}`,
    name: cleanText(record.station_name) || GENERIC_NAME,
    street: cleanText(record.street_address),
    city: cleanText(record.city),
    state: cleanText(record.state, 20),
    zip: cleanText(record.zip, 10),
    lat: round4(lat),
    lng: round4(lng),
    hours: cleanText(record.access_days_time),
    phone: cleanText(record.station_phone, 40),
    fuels: ['e85'],
    doe: record.id,
    verified: ISO_DATE.test(record.date_last_confirmed) ? record.date_last_confirmed : '',
  });
}

const cellOf = (lat, lng) => `${Math.floor(lat / GRID)}:${Math.floor(lng / GRID)}`;

function buildGrid(stations) {
  const grid = new Map();
  stations.forEach((station, index) => {
    const key = cellOf(station.lat, station.lng);
    grid.set(key, [...(grid.get(key) || []), index]);
  });
  return grid;
}

function nearestUnclaimed(doe, osm, grid, claimed) {
  const row = Math.floor(doe.lat / GRID);
  const col = Math.floor(doe.lng / GRID);
  let best = null;
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      for (const index of grid.get(`${r}:${c}`) || []) {
        if (claimed.has(index)) continue;
        const meters = distanceMiles(doe, osm[index]) * METERS_PER_MILE;
        if (meters <= MERGE_METERS && (!best || meters < best.meters)) best = { index, meters };
      }
    }
  }
  return best ? best.index : -1;
}

function combine(osmStation, doeStation) {
  const pick = (field) => osmStation[field] || doeStation[field];
  return compact({
    ...osmStation,
    name: osmStation.name === GENERIC_NAME ? doeStation.name : osmStation.name,
    street: pick('street'),
    city: pick('city'),
    state: pick('state'),
    zip: pick('zip'),
    hours: pick('hours'),
    phone: pick('phone'),
    fuels: FUELS.filter((f) => osmStation.fuels.includes(f) || doeStation.fuels.includes(f)),
    doe: doeStation.doe,
    verified: doeStation.verified,
  });
}

/**
 * Fold each DOE E85 station into the nearest OSM station within a block, so one
 * forecourt shows once with every fuel. Each OSM station takes at most one DOE record.
 * Returns new objects; the inputs are left as they were.
 */
export function mergeStations(osmStations, doeStations) {
  const grid = buildGrid(osmStations);
  const claimed = new Map(); // osm index -> doe station
  const unmatched = [];
  for (const doe of doeStations) {
    const index = nearestUnclaimed(doe, osmStations, grid, claimed);
    if (index === -1) unmatched.push({ ...doe });
    else claimed.set(index, doe);
  }
  const merged = osmStations.map((station, index) => (claimed.has(index)
    ? combine(station, claimed.get(index))
    : { ...station }));
  return [...merged, ...unmatched];
}
