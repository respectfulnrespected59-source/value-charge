// VALUE CHARGE: search a place, list the kerosene / diesel / E85 stations around it,
// show them on the map, and keep saved stops + your own price log on this device.
import { formatMoney } from './lib/format.js';
import { createGeocoder } from './lib/geocode.js';
import { FUELS } from './lib/normalize.js';
import { filterStations, sortStations } from './lib/query.js';
import { detailHtml, emptyHtml, FUEL_META, resultsSummary, stationCard } from './lib/render.js';
import { createStore } from './lib/store.js';
import { createTileLoader } from './lib/tiles.js';
import { parseState, serializeState } from './lib/url-state.js';
import { createMapView } from './ui/map.js';
import { createPlanner } from './ui/planner.js';

const PAGE_SIZE = 50;
const TOAST_MS = 3200;
const LOCATE_TIMEOUT_MS = 10000;
const MIN_NAME_MATCH = 3;
const roundToKm = (n) => Math.round(n * 100) / 100; // ~1 km: plenty for a 5-100 mi search, kinder in a shared link
const FOCUS_ATTRS = ['data-select', 'data-save', 'data-plan', 'data-clear-price', 'data-show-more'];

const $ = (id) => document.getElementById(id);
const els = {
  search: $('locationSearch'), submit: $('searchSubmit'), locate: $('locateButton'), message: $('searchMessage'),
  radius: $('radiusSelect'), sort: $('sortSelect'), list: $('resultsList'), count: $('resultsCount'),
  title: $('resultsTitle'), detail: $('stationDetail'), area: $('mapAreaLabel'), map: $('map'),
  mapFallback: $('mapFallback'), savedCount: $('savedCount'), toast: $('toast'),
};

// Reading window.localStorage can itself throw (blocked storage); the store catches calls.
const storage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const store = createStore(storage);
const tiles = createTileLoader();
const geocoder = createGeocoder();
let state = initialState();
let view = { visible: [], selected: null };
let mapView = null;
let loadToken = 0;
let searchToken = 0;
let toastTimer = 0;
const lastHtml = new WeakMap();

function initialState() {
  const url = parseState(window.location.search);
  const last = store.lastSearch();
  // Any shared link wins, even one for the default area (which carries no lat/lng);
  // the last search is only for a plain visit to the bare address.
  const place = !window.location.search && last
    ? { label: last.q, lat: last.lat, lng: last.lng }
    : { label: url.q, lat: url.lat, lng: url.lng };
  return {
    place, fuels: url.fuels, radius: url.radius, sort: url.sort, selectedId: url.station,
    savedOnly: false, nearby: [], status: 'loading', shown: PAGE_SIZE,
  };
}

function update(patch) {
  state = { ...state, ...patch };
  render();
}

// ---------- derive + render ----------

function deriveVisible() {
  const source = state.savedOnly ? store.savedList() : state.nearby;
  const radius = state.savedOnly ? Infinity : state.radius;
  const list = filterStations(source, { center: state.place, radius, fuels: state.fuels });
  return sortStations(list, state.sort, { prices: store.prices(), fuels: state.fuels });
}

// Keep the selection honest: a station that dropped out of the list hands the selection to
// what is now shown, and a selected station past the first page makes its card visible.
function reconcile(visible) {
  const index = visible.findIndex((s) => s.id === state.selectedId);
  if (state.selectedId && index === -1 && state.status === 'ready') {
    state = { ...state, selectedId: visible[0]?.id ?? null };
  } else if (index >= state.shown) {
    state = { ...state, shown: Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE };
  }
}

function render() {
  const focus = focusKey();
  const visible = deriveVisible();
  reconcile(visible);
  const selected = visible.find((s) => s.id === state.selectedId) || visible[0] || null;
  view = { visible, selected };
  renderControls();
  renderList(visible, selected);
  renderDetail(selected);
  mapView?.update({
    stations: visible, selectedId: selected?.id, place: state.place,
    radius: state.savedOnly ? null : state.radius, fuels: state.fuels,
  });
  syncUrl(selected);
  restoreFocus(focus);
}

// Only touch the DOM when the markup changed, so a half-typed price or a focused button survives.
function setHtml(el, html) {
  if (lastHtml.get(el) === html) return;
  el.innerHTML = html;
  lastHtml.set(el, html);
}

function focusKey() {
  const el = document.activeElement;
  const attr = el && FOCUS_ATTRS.find((name) => el.hasAttribute?.(name));
  if (!attr) return null;
  const scope = el.closest('#stationDetail') ? '#stationDetail' : '#resultsList';
  return `${scope} [${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
}

function restoreFocus(key) {
  if (!key || (document.activeElement && document.activeElement !== document.body)) return;
  document.querySelector(key)?.focus({ preventScroll: true });
}

function renderControls() {
  document.querySelectorAll('.fuel-filter').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.fuels.includes(button.dataset.fuel)));
  });
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = (button.dataset.view === 'saved') === state.savedOnly;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  els.radius.value = String(state.radius);
  els.radius.disabled = state.savedOnly;
  els.sort.value = state.sort;
  els.savedCount.textContent = String(store.savedList().length);
  els.title.textContent = state.savedOnly ? 'Saved stations' : 'Nearby stations';
  els.area.textContent = state.savedOnly ? 'Your saved stops' : `${state.place.label} search area`;
}

function listHtml(visible, selected) {
  if (state.status === 'loading' && !state.savedOnly) return '<div class="loading-state">Loading stations…</div>';
  if (state.status === 'error' && !state.savedOnly) {
    return `<div class="empty-state"><strong>Could not load stations</strong>Check your connection and try again.
      <br><button type="button" data-retry>Try again</button></div>`;
  }
  if (!visible.length) return emptyHtml(state);
  const prices = store.prices();
  const cards = visible.slice(0, state.shown).map((station, i) => stationCard(station, {
    index: i + 1, selected: station.id === selected?.id, saved: store.isSaved(station.id), prices,
  }));
  const more = visible.length > state.shown
    ? `<button class="show-more" type="button" data-show-more>Show ${Math.min(PAGE_SIZE, visible.length - state.shown)} more of ${visible.length}</button>`
    : '';
  return cards.join('') + more;
}

function renderList(visible, selected) {
  const loading = state.status === 'loading' && !state.savedOnly;
  const failed = state.status === 'error' && !state.savedOnly;
  els.list.setAttribute('aria-busy', String(loading));
  els.count.textContent = loading ? 'Loading…' : failed ? 'Offline?' : resultsSummary(visible.length, state);
  setHtml(els.list, listHtml(visible, selected));
}

function renderDetail(selected) {
  if (!selected) {
    const text = state.status === 'loading' ? 'Loading stations…' : 'Choose one from the list or the map.';
    setHtml(els.detail, `<div class="empty-state"><strong>Pick a station</strong>${text}</div>`);
    return;
  }
  const draft = priceDraft();
  setHtml(els.detail, detailHtml(selected, { saved: store.isSaved(selected.id), prices: store.prices() }));
  if (draft?.id === selected.id) restoreDraft(draft);
}

// A price being typed survives the panel redrawing for the same station (e.g. pressing Save).
function priceDraft() {
  const form = els.detail.querySelector('[data-price-form]');
  return form ? { id: form.dataset.priceForm, fuel: form.elements.fuel.value, price: form.elements.price.value } : null;
}

function restoreDraft(draft) {
  const form = els.detail.querySelector('[data-price-form]');
  if (!form || form.elements.price.value) return;
  form.elements.fuel.value = draft.fuel;
  form.elements.price.value = draft.price;
}

function syncUrl(selected) {
  const station = state.selectedId && selected?.id === state.selectedId ? state.selectedId : null;
  const query = serializeState({ q: state.place.label, lat: state.place.lat, lng: state.place.lng,
    fuels: state.fuels, radius: state.radius, sort: state.sort, station });
  window.history.replaceState(null, '', `${window.location.pathname}${query}`);
}

// ---------- feedback ----------

function setMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle('is-error', isError);
  if (!isError) els.search.removeAttribute('aria-invalid');
}

function showToast(text) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), TOAST_MS);
}

function setBusy(busy) {
  els.submit.disabled = busy;
  els.locate.disabled = busy;
}

// ---------- loading ----------

/** Resolves true when stations loaded, false when they failed, null when a newer load took over. */
async function loadNearby() {
  const token = ++loadToken;
  update({ status: 'loading' });
  try {
    const nearby = await tiles.stationsNear(state.place, state.radius);
    if (token !== loadToken) return null;
    update({ nearby, status: 'ready' });
    return true;
  } catch (err) {
    console.error('[value-charge] could not load stations:', err);
    if (token !== loadToken) return null;
    update({ status: 'error' });
    return false;
  }
}

async function goTo(label, point) {
  const place = { label, lat: point.lat, lng: point.lng };
  store.rememberSearch({ q: label, lat: place.lat, lng: place.lng });
  els.search.value = label;
  update({ place, selectedId: null, savedOnly: false, shown: PAGE_SIZE });
  mapView?.fitRadius(place, state.radius);
  return loadNearby();
}

function findStation(id) {
  return view.visible.find((s) => s.id === id)
    || state.nearby.find((s) => s.id === id)
    || store.savedList().find((s) => s.id === id)
    || null;
}

// ---------- actions ----------

function selectStation(id, from) {
  update({ selectedId: id });
  const station = view.selected;
  if (from === 'list' && station) mapView?.focus(station);
  if (from === 'map') revealCard(id);
}

// Scroll the list box only. scrollIntoView() also scrolled the PAGE, which on a phone
// yanked the map out from under the finger that just tapped it.
function revealCard(id) {
  const card = els.list.querySelector(`[data-card="${CSS.escape(id)}"]`);
  if (!card) return;
  const list = els.list.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  if (box.top < list.top || box.bottom > list.bottom) els.list.scrollTop += box.top - list.top - 8;
}

// Only an exact station name jumps to a station; anything else is a place search, so
// "Round Rock" searches the city even when a "Round Rock Fuel" is listed.
function matchStationName(query) {
  const q = query.toLowerCase().replace(/\s+/g, ' ');
  if (q.length < MIN_NAME_MATCH) return null;
  return view.visible.find((s) => s.name.toLowerCase() === q) || null;
}

const GEOCODE_MESSAGES = {
  'not-found': 'We could not find that place in the US. Try a city and state, or a ZIP code.',
  unavailable: 'Place search is not answering right now. Try "Use my location" or search again shortly.',
  empty: 'Enter a city, ZIP code or station name.',
};

function reportArrival(ok, label) {
  if (ok === null) return; // a newer search took over
  setMessage(ok ? `Showing stations near ${label}.` : `Found ${label}, but the stations did not load. Use Try again below.`, !ok);
}

async function onSearch(event) {
  event.preventDefault();
  const query = els.search.value.trim();
  const station = query ? matchStationName(query) : null;
  if (station) {
    selectStation(station.id, 'list');
    setMessage(`${station.name} selected (the nearest with that name).`);
    return;
  }
  const token = ++searchToken;
  setBusy(true);
  setMessage(query ? 'Finding that place…' : '');
  try {
    const place = await geocoder.geocode(query);
    if (token !== searchToken) return;
    const ok = await goTo(place.label, place);
    if (token === searchToken) reportArrival(ok, place.label);
  } catch (err) {
    if (token !== searchToken) return;
    els.search.setAttribute('aria-invalid', 'true');
    setMessage(GEOCODE_MESSAGES[err.code] || GEOCODE_MESSAGES.unavailable, true);
    if (!err.code) console.error('[value-charge] search failed:', err);
  } finally {
    if (token === searchToken) setBusy(false);
  }
}

function onLocate() {
  if (!('geolocation' in navigator)) {
    setMessage('This browser cannot share its location. Type a city or ZIP instead.', true);
    return;
  }
  const token = ++searchToken;
  setBusy(true);
  setMessage('Finding your location…');
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      if (token !== searchToken) return;
      const point = { lat: roundToKm(position.coords.latitude), lng: roundToKm(position.coords.longitude) };
      const ok = await goTo('Your location', point);
      if (token === searchToken && ok !== null) setMessage(ok ? 'Showing stations near you.' : 'Found you, but the stations did not load. Use Try again below.', !ok);
    } finally {
      if (token === searchToken) setBusy(false);
    }
  }, (err) => {
    if (token !== searchToken) return;
    setBusy(false);
    setMessage(err.code === 1
      ? 'Location is turned off for this site. Allow it, or type a city or ZIP.'
      : 'Could not find your location. Type a city or ZIP instead.', true);
  }, { enableHighAccuracy: false, timeout: LOCATE_TIMEOUT_MS, maximumAge: 300000 });
}

function toggleFuel(fuel) {
  const fuels = state.fuels.includes(fuel)
    ? state.fuels.filter((f) => f !== fuel)
    : FUELS.filter((f) => f === fuel || state.fuels.includes(f));
  update({ fuels, shown: PAGE_SIZE });
}

function setRadius(radius) {
  update({ radius, shown: PAGE_SIZE });
  mapView?.fitRadius(state.place, radius);
  loadNearby();
}

function toggleSave(id) {
  const station = findStation(id);
  if (!station) return;
  const saved = store.toggleSaved(station);
  render();
  const where = store.persistent ? 'on this device' : 'until you close this tab (private browsing)';
  showToast(saved ? `${station.name} saved ${where}.` : `${station.name} removed from saved stops.`);
}

function onPriceForm(form) {
  const station = findStation(form.dataset.priceForm);
  const fuel = form.elements.fuel.value;
  const price = Number(form.elements.price.value);
  if (!station || !store.logPrice(station.id, fuel, price)) {
    form.elements.price.setAttribute('aria-invalid', 'true');
    showToast('Enter a price between $0.50 and $20.00.');
    return;
  }
  form.elements.price.value = ''; // logged: this draft is done
  render();
  showToast(`Logged ${FUEL_META[fuel].label} at ${formatMoney(price)} for ${station.name}.`);
}

function clearPrice(fuel) {
  if (!view.selected) return;
  store.clearPrice(view.selected.id, fuel);
  render();
  showToast(`Removed your ${FUEL_META[fuel].label} price.`);
}

// ---------- wiring ----------

const planner = createPlanner({
  store,
  // The selected station always leads, even when it sits past the first page of the list.
  stationsForPlanner: () => {
    const list = [view.selected, ...view.visible.slice(0, PAGE_SIZE), ...store.savedList()].filter(Boolean);
    return [...new Map(list.map((s) => [s.id, s])).values()];
  },
  onPriceLogged: () => render(),
});

const CLICK_ACTIONS = [
  ['[data-select]', (el) => selectStation(el.dataset.select, 'list')],
  ['[data-save]', (el) => toggleSave(el.dataset.save)],
  ['[data-plan]', (el) => planner.open(el.dataset.plan)],
  ['[data-clear-price]', (el) => clearPrice(el.dataset.clearPrice)],
  ['[data-show-more]', () => update({ shown: state.shown + PAGE_SIZE })],
  ['[data-show-all]', () => update({ savedOnly: false })],
  ['[data-all-fuels]', () => update({ fuels: [...FUELS] })],
  ['[data-radius]', (el) => setRadius(Number(el.dataset.radius))],
  ['[data-retry]', () => loadNearby()],
  ['[data-fuel]', (el) => toggleFuel(el.dataset.fuel)],
  ['[data-view]', (el) => {
    update({ savedOnly: el.dataset.view === 'saved', shown: PAGE_SIZE });
    $('locator').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }],
];

document.addEventListener('click', (event) => {
  for (const [selector, action] of CLICK_ACTIONS) {
    const el = event.target.closest(selector);
    if (el) {
      action(el);
      return;
    }
  }
});
document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-price-form]');
  if (!form) return;
  event.preventDefault();
  onPriceForm(form);
});
$('searchForm').addEventListener('submit', onSearch);
els.locate.addEventListener('click', onLocate);
els.radius.addEventListener('change', () => setRadius(Number(els.radius.value)));
els.sort.addEventListener('change', () => update({ sort: els.sort.value }));
$('openCalculator').addEventListener('click', () => planner.open(view.selected?.id));
// Another tab saved a stop or logged a price: pick it up instead of overwriting it later.
window.addEventListener('storage', (event) => {
  if (event.key === null || event.key.startsWith('vc.')) {
    store.reload();
    render();
  }
});

async function showDataInfo() {
  try {
    const index = await tiles.index();
    const count = index.counts.stations.toLocaleString('en-US');
    $('heroEyebrow').textContent = `Nationwide · ${count} stations listed`;
    const date = new Date(`${index.sources.osm}T12:00:00`);
    $('dataDates').textContent = `Listings updated ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`;
  } catch (err) {
    console.error('[value-charge] station index unavailable:', err);
  }
}

async function startMap() {
  try {
    mapView = await createMapView(els.map, {
      center: state.place,
      radius: state.radius,
      onSelect: (id) => selectStation(id, 'map'),
    });
    // The place may have moved (a search, a radius change) while the map was loading.
    if (!state.savedOnly) mapView.fitRadius(state.place, state.radius);
    render();
  } catch (err) {
    console.error('[value-charge] map unavailable:', err);
    els.mapFallback.textContent = 'The map could not load on this device. The list still has every station.';
    els.mapFallback.hidden = false;
  }
}

function registerOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[value-charge] offline copy unavailable:', err));
}

els.search.value = state.place.label;
render();
showDataInfo();
loadNearby();
startMap();
registerOffline();
