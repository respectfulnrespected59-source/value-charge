// City / ZIP -> a point on the map. Nominatim (OpenStreetMap) first, Photon as the
// backup when Nominatim is down. US results only. Answers are remembered for the
// visit so a repeat search never calls out again (Nominatim asks for <= 1 call a second).
import { round4 } from './normalize.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PHOTON = 'https://photon.komoot.io/api/';
const TIMEOUT_MS = 8000;
const MAX_QUERY = 80;

export class GeocodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GeocodeError';
    this.code = code; // 'empty' | 'not-found' | 'unavailable'
  }
}

const STATE_CODES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
  Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
  Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

export function classifyQuery(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'empty' };
  const zip = text.match(/^(\d{5})(?:-\d{4})?$/);
  if (zip) return { kind: 'zip', zip: zip[1] };
  return { kind: 'place', text: text.slice(0, MAX_QUERY) };
}

function label(query, place, stateName, stateCode) {
  const code = stateCode || STATE_CODES[stateName] || '';
  const where = place && code && place !== stateName ? `${place}, ${code}` : place || stateName || 'Search area';
  return query.kind === 'zip' ? `${query.zip} · ${where}` : where;
}

function toPoint(lat, lng, text) {
  const la = Number(lat);
  const lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo) ? { label: text, lat: round4(la), lng: round4(lo) } : null;
}

function nominatimUrl(query) {
  const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'us' });
  if (query.kind === 'zip') params.set('postalcode', query.zip);
  else params.set('q', query.text);
  return `${NOMINATIM}?${params}`;
}

function readNominatim(query, body) {
  if (!Array.isArray(body)) return null;
  for (const hit of body) {
    const a = hit.address || {};
    if (a.country_code && a.country_code !== 'us') continue;
    const place = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || hit.name;
    const code = String(a['ISO3166-2-lvl4'] || '').replace(/^US-/, '');
    const point = toPoint(hit.lat, hit.lon, label(query, place, a.state, code));
    if (point) return point;
  }
  return null;
}

function photonUrl(query) {
  const params = new URLSearchParams({ q: query.kind === 'zip' ? query.zip : query.text, limit: '5', lang: 'en' });
  return `${PHOTON}?${params}`;
}

function readPhoton(query, body) {
  for (const feature of body?.features || []) {
    const p = feature.properties || {};
    if (p.countrycode !== 'US') continue;
    const [lng, lat] = feature.geometry?.coordinates || [];
    const place = query.kind === 'zip' ? p.city || p.name : p.name || p.city;
    const point = toPoint(lat, lng, label(query, place, p.state, ''));
    if (point) return point;
  }
  return null;
}

const warn = (service, err) => console.warn(`[value-charge] ${service} place search failed:`, err?.message || err);

export function createGeocoder({ fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = TIMEOUT_MS, onError = warn } = {}) {
  const cache = new Map();

  async function ask(url, read, query) {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`geocoder answered ${res.status}`);
    return read(query, await res.json());
  }

  async function geocode(raw) {
    const query = classifyQuery(raw);
    if (query.kind === 'empty') throw new GeocodeError('empty', 'Enter a city, address or ZIP code.');
    const key = (query.zip || query.text).toLowerCase();
    if (cache.has(key)) return { ...cache.get(key) };

    let answered = false;
    const services = [['Nominatim', nominatimUrl(query), readNominatim], ['Photon', photonUrl(query), readPhoton]];
    for (const [service, url, read] of services) {
      try {
        const point = await ask(url, read, query);
        answered = true;
        if (point) {
          cache.set(key, point);
          return { ...point };
        }
      } catch (err) {
        onError(service, err); // this one is down, slow or answered oddly: say so, then try the next
      }
    }
    throw answered
      ? new GeocodeError('not-found', 'We could not find that place in the US.')
      : new GeocodeError('unavailable', 'Place search is not answering right now.');
  }

  return { geocode };
}
