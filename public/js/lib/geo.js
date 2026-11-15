// Distance and tile math. Pure functions, shared by the browser and the data build.

export const EARTH_RADIUS_MI = 3958.8;
export const TILE_DEGREES = 2;
const MILES_PER_DEGREE = (2 * Math.PI * EARTH_RADIUS_MI) / 360;
const MAX_LAT = 89.9;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const floorToTile = (value) => Math.floor(value / TILE_DEGREES) * TILE_DEGREES;

/** Great-circle distance in miles between two {lat, lng} points (haversine). */
export function distanceMiles(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The data tile a point falls in, e.g. "30_-98" for Austin. */
export function tileKey(lat, lng) {
  return `${floorToTile(lat) || 0}_${floorToTile(lng) || 0}`;
}

/** [[west, south], [east, north]] around a point, wide enough to hold the whole circle. */
export function boundsForRadius(center, miles) {
  const dLat = miles / MILES_PER_DEGREE;
  const south = Math.max(-MAX_LAT, center.lat - dLat);
  const north = Math.min(MAX_LAT, center.lat + dLat);
  // East-west degrees shrink toward the poles; size the box for its widest latitude.
  const widestLat = Math.max(Math.abs(south), Math.abs(north));
  const dLng = Math.min(180, dLat / Math.cos(toRadians(widestLat)));
  return [[center.lng - dLng, south], [center.lng + dLng, north]];
}

/** A GeoJSON polygon ring approximating the search circle, for drawing on the map. */
export function circlePolygon(center, miles, steps = 64) {
  const d = miles / EARTH_RADIUS_MI;
  const lat1 = toRadians(center.lat);
  const lng1 = toRadians(center.lng);
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (2 * Math.PI * (i % steps)) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/** Every tile key the search circle touches. */
export function tilesForRadius(center, miles) {
  const [[west, south], [east, north]] = boundsForRadius(center, miles);
  const keys = [];
  for (let lat = floorToTile(south); lat <= floorToTile(north); lat += TILE_DEGREES) {
    for (let lng = floorToTile(west); lng <= floorToTile(east); lng += TILE_DEGREES) {
      keys.push(tileKey(lat, lng));
    }
  }
  return keys;
}
