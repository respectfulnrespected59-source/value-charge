// Recolour the OpenFreeMap "positron" style into the VALUE CHARGE peach map the
// original design drew by hand: peach land, cream roads, navy water.
// Returns a new style object; the one passed in is not touched.

export const MAP_COLORS = Object.freeze({
  land: '#efb99e',
  landAlt: '#f3c4aa',
  park: '#e7aa8e',
  water: '#31566a',
  road: '#ffe7d5',
  minorRoad: '#f8d3bf',
  roadCasing: '#d99877',
  rail: '#c98a6e',
  building: '#e6ad92',
  boundary: '#9d6b55',
  label: '#5c3426',
  labelHalo: '#f5cbb2',
  waterLabel: '#e8f1f5',
});

const MAJOR_ROAD = /motorway|trunk|primary|secondary|tertiary|major/;
const ROAD_LAYER = /^(road|bridge|tunnel|highway)/;
const DROP_LAYER = /^(poi|building-3d|road_one_way|natural_earth|aeroway)/;

function fillColor(id) {
  if (id.includes('water')) return MAP_COLORS.water;
  if (id.includes('building')) return MAP_COLORS.building;
  if (/park|landcover|wood|grass|pitch|cemetery/.test(id)) return MAP_COLORS.park;
  return MAP_COLORS.landAlt;
}

function lineColor(id) {
  if (id.includes('water')) return MAP_COLORS.water;
  if (id.includes('boundary')) return MAP_COLORS.boundary;
  if (id.includes('park')) return MAP_COLORS.park;
  if (id.includes('rail')) return MAP_COLORS.rail;
  if (id.includes('casing')) return MAP_COLORS.roadCasing;
  if (ROAD_LAYER.test(id)) return MAJOR_ROAD.test(id) ? MAP_COLORS.road : MAP_COLORS.minorRoad;
  return null;
}

function paintFor(layer) {
  const { id, type } = layer;
  if (type === 'background') return { 'background-color': MAP_COLORS.land };
  if (type === 'fill') return { 'fill-color': fillColor(id), 'fill-outline-color': fillColor(id) };
  if (type === 'line') {
    const color = lineColor(id);
    return color ? { 'line-color': color } : {};
  }
  if (type === 'symbol' && layer.layout?.['text-field']) {
    const isWater = id.includes('water');
    return {
      'text-color': isWater ? MAP_COLORS.waterLabel : MAP_COLORS.label,
      'text-halo-color': isWater ? MAP_COLORS.water : MAP_COLORS.labelHalo,
    };
  }
  return {};
}

export function brandStyle(style) {
  if (!style || typeof style !== 'object' || !Array.isArray(style.layers)) {
    throw new Error('Not a map style: no layers');
  }
  const layers = style.layers
    .filter((layer) => !DROP_LAYER.test(layer.id))
    .map((layer) => ({ ...layer, paint: { ...layer.paint, ...paintFor(layer) } }));
  return { ...style, layers };
}
