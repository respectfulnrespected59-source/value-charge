# VALUE CHARGE

Find real **kerosene, diesel and E85** stations anywhere in the US. Search a city or ZIP (or use
your location), filter by fuel and distance, see every stop on a live map, save the ones you use,
log the prices you see, and estimate a fill-up. Free, no accounts, no tracking.

Started as a QUAN-TESS AI preview with 8 sample Austin stations; this is the full build.

## Where the stations come from

| Fuel | Source | Count (2026-11-15) |
|---|---|---|
| Diesel | OpenStreetMap stations tagged `fuel:diesel=yes` / `fuel:HGV_diesel=yes` | 8,089 |
| Kerosene | OpenStreetMap stations tagged `fuel:kerosene=yes` | 184 |
| E85 | U.S. DOE Alternative Fuels Data Center (open, public stations) + OSM `fuel:e85=yes` | 4,973 |

12,502 stations in 273 tiles of 2° x 2° (`public/data/tiles/<lat>_<lng>.json`). A DOE E85 station
within 120 m of an OSM station is folded into it, so one forecourt shows once with every fuel.

There are **no live pump prices** (no free US source exists). Drivers log the price they see; it
stays in their browser (`localStorage`) and drives the "My logged price" sort.

Coverage is honest, not complete: OSM only knows the fuels people have tagged (about 8% of US
stations list diesel), and kerosene is rare in public data. The app says so when a search is empty.

## Run it

```bash
npm install
npm start            # http://127.0.0.1:4174
npm test             # unit tests (coverage gate 80%) + Playwright on phone and laptop
```

## Refresh the station data

```bash
npm run data:fetch   # Overpass (US-wide, ~2 min) + DOE AFDC (developer.nlr.gov, DEMO_KEY or NLR_API_KEY)
npm run data:build   # rebuilds public/data; refuses to publish if counts fall below the floors
```

The DOE API moved from `developer.nrel.gov` to `developer.nlr.gov` when NREL became the National
Laboratory of the Rockies; the old host no longer resolves.

## How it is built

- Static site, no build step, no server: `public/` is what Render serves.
- `public/js/lib/` is pure, unit-tested logic (geo, normalize, query, url-state, store, render,
  geocode, tiles, map-style). `public/js/app.js` wires the page; `public/js/ui/` holds the map and
  the calculator.
- Map: MapLibre GL 6.18.0 (ES-module build, self-hosted in `public/vendor/`, `npm run vendor`) over the
  OpenFreeMap "positron" vector style, recoloured to the brand palette at load time.
- Place search: Nominatim, with Photon as the backup. Called only on a search, cached per visit.
- Fonts are self-hosted (`node tools/fetch_fonts.mjs`); icons from `python tools/make_icons.py`.
- Security: strict CSP (no inline script, `connect-src` limited to the three map/search hosts),
  every value from map data or storage escaped before render, storage re-validated on load.
  Headers live in `scripts/headers.mjs` and `render.yaml`; a unit test keeps them identical.

## Deploy (Render)

`render.yaml` is a Blueprint for a free static site. **`autoDeploy: true`: every push to `main`
goes live**, so run `npm test` first. After a deploy, ask the live site what it serves:

```bash
npm run audit:live -- https://value-charge.onrender.com
```

## Credits

Station data © OpenStreetMap contributors (ODbL) and the U.S. Department of Energy. Map tiles by
OpenFreeMap, © OpenMapTiles. Fonts: Barlow Condensed and DM Sans (SIL OFL). Built with QUAN-TESS AI.
