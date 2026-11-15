// Pure part of the data build: raw OSM + DOE records -> tiles + index.
import { tileKey, TILE_DEGREES } from '../../public/js/lib/geo.js';
import { FUELS, mergeStations, normalizeAfdc, normalizeOsm } from '../../public/js/lib/normalize.js';

// Floors from the 2026-11-15 build (13k stations). A source that suddenly returns far
// fewer is a broken download, not a real change; refuse to publish it.
export const MINIMUM_COUNTS = Object.freeze({ stations: 9000, diesel: 6000, kerosene: 100, e85: 4000 });

function uniqueById(stations) {
  return [...new Map(stations.map((s) => [s.id, s])).values()];
}

function countFuels(stations) {
  const counts = { stations: stations.length };
  for (const fuel of FUELS) counts[fuel] = stations.filter((s) => s.fuels.includes(fuel)).length;
  return counts;
}

export function buildDataset(osmJson, afdcJson, { built, osmDate, doeDate }) {
  const osm = uniqueById((osmJson?.elements || []).map(normalizeOsm).filter(Boolean));
  const doe = uniqueById((afdcJson?.fuel_stations || []).map(normalizeAfdc).filter(Boolean));
  const stations = mergeStations(osm, doe);

  const grouped = new Map();
  for (const station of stations) {
    const key = tileKey(station.lat, station.lng);
    grouped.set(key, [...(grouped.get(key) || []), station]);
  }
  const keys = [...grouped.keys()].sort();
  const tiles = keys.map((key) => ({
    v: 1,
    key,
    stations: [...grouped.get(key)].sort((a, b) => a.id.localeCompare(b.id)),
  }));
  const index = {
    v: 1,
    built,
    tileDegrees: TILE_DEGREES,
    sources: { osm: osmDate, doe: doeDate },
    counts: countFuels(stations),
    tiles: Object.fromEntries(tiles.map((t) => [t.key, t.stations.length])),
  };
  return { index, tiles };
}

/** Returns the problems; an empty list means the dataset is fit to publish. */
export function checkCounts(counts, minimums = MINIMUM_COUNTS) {
  return Object.entries(minimums)
    .filter(([field, min]) => !(counts[field] >= min))
    .map(([field, min]) => `${field}: ${counts[field] ?? 0} is below the floor of ${min}`);
}
