// Filter and sort the stations around a search point. Pure: returns new arrays.
import { distanceMiles } from './geo.js';
import { FUELS } from './normalize.js';

export function filterStations(stations, { center, radius, fuels }) {
  const wanted = new Set(fuels);
  if (!wanted.size) return [];
  return stations
    .filter((station) => station.fuels.some((fuel) => wanted.has(fuel)))
    .map((station) => ({ ...station, distance: distanceMiles(center, station) }))
    .filter((station) => station.distance <= radius);
}

function lowestLoggedPrice(station, prices, fuels) {
  const logged = prices[station.id];
  if (!logged) return Infinity;
  const values = fuels.map((fuel) => logged[fuel]?.price).filter(Number.isFinite);
  return values.length ? Math.min(...values) : Infinity;
}

const byDistance = (a, b) => a.distance - b.distance;
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/** sort = 'distance' | 'name' | 'price' (your own logged prices first, cheapest first). */
export function sortStations(stations, sort, { prices = {}, fuels = FUELS } = {}) {
  const list = [...stations];
  if (sort === 'name') return list.sort((a, b) => byName(a, b) || byDistance(a, b));
  if (sort === 'price') {
    const lowest = new Map(list.map((s) => [s.id, lowestLoggedPrice(s, prices, fuels)]));
    return list.sort((a, b) => {
      const pa = lowest.get(a.id);
      const pb = lowest.get(b.id);
      if (pa !== pb) return pa === Infinity ? 1 : pb === Infinity ? -1 : pa - pb;
      return byDistance(a, b);
    });
  }
  return list.sort((a, b) => byDistance(a, b) || byName(a, b));
}
