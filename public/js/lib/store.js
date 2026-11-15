// Saved stops, your price log and your last search, kept on this device only.
// localStorage is outside input (anyone can edit it), so everything is re-checked
// on load. A storage that throws (private mode) keeps working in memory.
import { cleanText, FUELS, isValidCoord } from './normalize.js';
import { STATION_ID } from './url-state.js';

export const KEYS = Object.freeze({ saved: 'vc.saved.v1', prices: 'vc.prices.v1', search: 'vc.search.v1' });
export const PRICE_RANGE = Object.freeze({ min: 0.5, max: 20 });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OSM_REF = /^(node|way|relation)\/\d+$/;
const TEXT_FIELDS = [['brand', 120], ['street', 120], ['city', 120], ['hours', 120], ['state', 20], ['zip', 10], ['phone', 40]];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPrice = (n) => Number.isFinite(n) && n >= PRICE_RANGE.min && n <= PRICE_RANGE.max;
const copy = (value) => JSON.parse(JSON.stringify(value));

function cleanSnapshot(id, raw) {
  if (!STATION_ID.test(id) || !isObject(raw) || !isValidCoord(raw.lat, raw.lng)) return null;
  const fuels = Array.isArray(raw.fuels) ? FUELS.filter((f) => raw.fuels.includes(f)) : [];
  if (!fuels.length) return null;
  const snapshot = { id, name: cleanText(raw.name) || 'Fuel station', lat: raw.lat, lng: raw.lng, fuels };
  for (const [field, max] of TEXT_FIELDS) if (cleanText(raw[field], max)) snapshot[field] = cleanText(raw[field], max);
  if (OSM_REF.test(raw.osm || '')) snapshot.osm = raw.osm;
  if (Number.isSafeInteger(raw.doe)) snapshot.doe = raw.doe;
  if (ISO_DATE.test(raw.verified || '')) snapshot.verified = raw.verified;
  if (ISO_DATE.test(raw.savedAt || '')) snapshot.savedAt = raw.savedAt;
  return snapshot;
}

function cleanSaved(raw) {
  if (!isObject(raw)) return {};
  return Object.fromEntries(Object.entries(raw)
    .map(([id, value]) => [id, cleanSnapshot(id, value)])
    .filter(([, value]) => value));
}

function cleanPrices(raw) {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [id, byFuel] of Object.entries(raw)) {
    if (!STATION_ID.test(id) || !isObject(byFuel)) continue;
    const entries = FUELS
      .filter((fuel) => isObject(byFuel[fuel]) && isPrice(byFuel[fuel].price) && ISO_DATE.test(byFuel[fuel].at))
      .map((fuel) => [fuel, { price: byFuel[fuel].price, at: byFuel[fuel].at }]);
    if (entries.length) out[id] = Object.fromEntries(entries);
  }
  return out;
}

function cleanSearch(raw) {
  if (!isObject(raw) || !isValidCoord(raw.lat, raw.lng)) return null;
  const q = cleanText(raw.q, 80);
  return q ? { q, lat: raw.lat, lng: raw.lng } : null;
}

// Reads/writes JSON and never throws: a blocked storage just stops persisting.
function safeStorage(storage) {
  let persistent = true;
  return {
    get persistent() { return persistent; },
    read(key) {
      let raw;
      try {
        raw = storage.getItem(key);
      } catch {
        persistent = false;
        return null;
      }
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null; // a corrupted value is dropped, the store keeps working
      }
    },
    write(key, value) {
      try {
        storage.setItem(key, JSON.stringify(value));
      } catch {
        persistent = false; // still kept for this visit
      }
    },
  };
}

const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

function withoutPrice(prices, id, fuel) {
  const rest = without(prices[id] || {}, fuel);
  return Object.keys(rest).length ? { ...prices, [id]: rest } : without(prices, id);
}

export function createStore(storage, today = localToday) {
  const io = safeStorage(storage);
  let saved = {};
  let prices = {};
  let search = null;
  /** Re-read everything (on start, and when another tab changes storage). */
  function reload() {
    saved = cleanSaved(io.read(KEYS.saved));
    prices = cleanPrices(io.read(KEYS.prices));
    search = cleanSearch(io.read(KEYS.search));
  }
  reload();

  return {
    get persistent() { return io.persistent; },
    reload,
    isSaved: (id) => Object.hasOwn(saved, id),
    savedList: () => Object.values(saved).map(copy),
    /** Save or unsave; returns true when the station is now saved. */
    toggleSaved(station) {
      const snapshot = Object.hasOwn(saved, station.id) ? null : cleanSnapshot(station.id, { ...station, savedAt: today() });
      if (!Object.hasOwn(saved, station.id) && !snapshot) return false;
      saved = snapshot ? { ...saved, [station.id]: snapshot } : without(saved, station.id);
      io.write(KEYS.saved, saved);
      return Boolean(snapshot);
    },
    prices: () => copy(prices),
    priceFor: (id, fuel) => (prices[id]?.[fuel] ? { ...prices[id][fuel] } : null),
    /** Remember the price you saw; returns false (and changes nothing) for a bad value. */
    logPrice(id, fuel, price) {
      if (!STATION_ID.test(id) || !FUELS.includes(fuel) || !isPrice(price)) return false;
      prices = { ...prices, [id]: { ...prices[id], [fuel]: { price: Math.round(price * 100) / 100, at: today() } } };
      io.write(KEYS.prices, prices);
      return true;
    },
    clearPrice(id, fuel) {
      if (!prices[id]?.[fuel]) return;
      prices = withoutPrice(prices, id, fuel);
      io.write(KEYS.prices, prices);
    },
    lastSearch: () => (search ? { ...search } : null),
    rememberSearch(next) {
      const clean = cleanSearch(next);
      if (!clean) return;
      search = clean;
      io.write(KEYS.search, search);
    },
  };
}
