// Load the station tiles a search needs. Tiles are static files built by
// scripts/data/build-tiles.mjs; each is fetched once per visit.
import { tilesForRadius } from './geo.js';
import { FUELS, isValidCoord } from './normalize.js';
import { STATION_ID } from './url-state.js';

const isStation = (s) => Boolean(s) && STATION_ID.test(s.id) && typeof s.name === 'string'
  && isValidCoord(s.lat, s.lng) && Array.isArray(s.fuels) && s.fuels.length > 0
  && s.fuels.every((f) => FUELS.includes(f));

function checkIndex(index) {
  if (!index || index.v !== 1 || !index.tiles || typeof index.tiles !== 'object') {
    throw new Error('Station index is not in the expected format');
  }
  return index;
}

const TIMEOUT_MS = 15000;

// A request that never settles would stay cached as "pending" forever; a timeout turns it
// into a rejection, which evicts it so the next search (or Try again) fetches it fresh.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createTileLoader({ fetchImpl = globalThis.fetch?.bind(globalThis), base = 'data/', timeoutMs = TIMEOUT_MS } = {}) {
  let indexPromise = null;
  const tiles = new Map();

  async function getJson(path) {
    const res = await withTimeout(fetchImpl(`${base}${path}`), timeoutMs, path);
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res.json();
  }

  function index() {
    if (!indexPromise) {
      indexPromise = getJson('index.json').then(checkIndex).catch((err) => {
        indexPromise = null; // let the next search try again
        throw err;
      });
    }
    return indexPromise;
  }

  function tile(key) {
    if (!tiles.has(key)) {
      const pending = getJson(`tiles/${key}.json`)
        .then((body) => (Array.isArray(body?.stations) ? body.stations.filter(isStation) : []))
        .catch((err) => {
          tiles.delete(key);
          throw err;
        });
      tiles.set(key, pending);
    }
    return tiles.get(key);
  }

  /** Every station in the tiles that touch the search circle (not yet cut to the radius). */
  async function stationsNear(center, radius) {
    const { tiles: available } = await index();
    const keys = tilesForRadius(center, radius).filter((key) => Object.hasOwn(available, key));
    const lists = await Promise.all(keys.map(tile));
    return lists.flat();
  }

  return { index, stationsNear };
}
