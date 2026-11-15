// The fuel cost calculator dialog. All values are user input: checked here, shown with textContent.
import { formatMoney } from '../lib/format.js';
import { FUEL_META } from '../lib/render.js';
import { PRICE_RANGE } from '../lib/store.js';

const GALLON_RANGE = Object.freeze({ min: 0.1, max: 500 });
const DEFAULT_GALLONS = '10';
const DEFAULT_NOTE = 'Prices are yours: VALUE CHARGE does not have live pump prices.';
const inRange = (n, { min, max }) => Number.isFinite(n) && n >= min && n <= max;

function findElements() {
  const $ = (id) => document.getElementById(id);
  return {
    dialog: $('plannerDialog'), form: $('plannerForm'), station: $('plannerStation'), fuel: $('plannerFuel'),
    gallons: $('plannerGallons'), price: $('plannerPrice'), remember: $('plannerRemember'), note: $('plannerNote'),
    result: $('planResult'), close: $('closePlanner'),
  };
}

function setNote(els, text, isError = false) {
  els.note.textContent = text;
  els.note.classList.toggle('is-error', isError);
}

function showResult(els, { station, fuel, gallons, price }) {
  const heading = document.createElement('span');
  heading.textContent = 'Estimated fuel cost';
  const total = document.createElement('strong');
  total.textContent = formatMoney(gallons * price);
  const detail = document.createElement('p');
  detail.textContent = `${gallons.toLocaleString('en-US', { maximumFractionDigits: 1 })} gal of ${FUEL_META[fuel].label} at ${station.name}, at ${formatMoney(price)}/gal.`;
  els.result.replaceChildren(heading, total, detail);
  els.result.hidden = false;
}

function readForm(els, stations) {
  return {
    station: stations.find((s) => s.id === els.station.value),
    fuel: els.fuel.value,
    gallons: Number(els.gallons.value),
    price: Number(els.price.value),
  };
}

export function createPlanner({ store, stationsForPlanner, onPriceLogged }) {
  const els = findElements();
  let stations = [];

  function syncPrice() {
    const logged = els.station.value ? store.priceFor(els.station.value, els.fuel.value) : null;
    els.price.value = logged ? logged.price.toFixed(2) : '';
    els.result.hidden = true;
  }
  function syncFuel() {
    const station = stations.find((s) => s.id === els.station.value);
    els.fuel.replaceChildren(...(station?.fuels || []).map((f) => new Option(FUEL_META[f].label, f)));
    syncPrice();
  }
  function open(stationId) {
    stations = stationsForPlanner();
    els.station.replaceChildren(...stations.map((s) => new Option(s.name, s.id)));
    els.form.querySelector('button[type="submit"]').disabled = stations.length === 0;
    setNote(els, stations.length ? DEFAULT_NOTE : 'Search an area first, then pick a station here.');
    if (stations.some((s) => s.id === stationId)) els.station.value = stationId;
    els.gallons.value = DEFAULT_GALLONS;
    syncFuel();
    if (els.dialog.open) return;
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
  }
  function calculate(event) {
    event.preventDefault();
    const values = readForm(els, stations);
    const gallonsOk = inRange(values.gallons, GALLON_RANGE);
    const priceOk = inRange(values.price, PRICE_RANGE);
    els.gallons.setAttribute('aria-invalid', String(!gallonsOk));
    els.price.setAttribute('aria-invalid', String(!priceOk));
    if (!values.station || !gallonsOk || !priceOk) {
      setNote(els, 'Enter gallons between 0.1 and 500 and a price between $0.50 and $20.00.', true);
      els.result.hidden = true;
      return;
    }
    const remembered = els.remember.checked && store.logPrice(values.station.id, values.fuel, values.price);
    if (remembered) onPriceLogged();
    showResult(els, values);
    setNote(els, remembered ? 'Price saved for this station on this device.' : 'Price not saved.');
  }

  bind(els, { syncFuel, syncPrice, calculate });
  return { open };
}

function bind(els, { syncFuel, syncPrice, calculate }) {
  els.station.addEventListener('change', syncFuel);
  els.fuel.addEventListener('change', syncPrice);
  for (const input of [els.gallons, els.price]) input.addEventListener('input', () => { els.result.hidden = true; });
  els.form.addEventListener('submit', calculate);
  els.close.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (event) => { if (event.target === els.dialog) els.dialog.close(); });
}
