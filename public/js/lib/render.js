// HTML for the station list, the detail panel and the empty states.
// Pure string builders: every value from map data or storage passes through escapeHtml.
import {
  directionsUrl, escapeHtml as e, formatAddress, formatHours, formatMiles, formatMoney, formatPhone,
  formatVerified, sourceUrl,
} from './format.js';

export const FUEL_META = Object.freeze({
  kerosene: { label: 'Kerosene', short: 'K-1' },
  diesel: { label: 'Diesel', short: 'D' },
  e85: { label: 'E85', short: 'E85' },
});

const shortDate = (iso) => {
  const [, m, d] = String(iso).split('-').map(Number);
  return m && d ? new Date(2000, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
};

const place = (s) => [s.city, s.state].filter(Boolean).join(', ');

function miniPrices(station, prices) {
  return station.fuels.map((fuel) => {
    const logged = prices?.[station.id]?.[fuel];
    const value = logged ? ` ${formatMoney(logged.price)}` : '';
    return `<span class="mini-price fuel-${fuel}"><b>${FUEL_META[fuel].short}</b>${value}</span>`;
  }).join('');
}

export function stationCard(station, { index, selected = false, saved = false, prices = {} }) {
  const hours = formatHours(station.hours);
  const meta = [place(station) || station.street || 'Address not listed', hours].filter(Boolean).join(' · ');
  const miles = Number.isFinite(station.distance) ? formatMiles(station.distance) : '';
  return `
    <article class="station-card${selected ? ' is-selected' : ''}" data-card="${e(station.id)}">
      <button class="station-main" type="button" data-select="${e(station.id)}" aria-label="View ${e(station.name)}${miles ? `, ${miles} away` : ''}">
        <span class="station-topline"><span class="station-index">${index}</span><span class="station-name">${e(station.name)}</span></span>
        <span class="station-meta"><span>${e(meta)}</span><strong>${miles}</strong></span>
        <span class="mini-prices">${miniPrices(station, prices)}</span>
      </button>
      <button class="save-button${saved ? ' is-saved' : ''}" type="button" data-save="${e(station.id)}" aria-label="${saved ? 'Remove' : 'Save'} ${e(station.name)}" aria-pressed="${saved}">${saved ? '★' : '☆'}</button>
    </article>`;
}

function fuelChip(station, fuel, prices) {
  const logged = prices?.[station.id]?.[fuel];
  const verified = fuel === 'e85' && station.doe ? formatVerified(station.verified) : '';
  const listing = verified ? `DOE verified ${verified}` : station.doe && fuel === 'e85' ? 'U.S. DOE list' : 'Listed on OpenStreetMap';
  const price = logged
    ? `<strong>${formatMoney(logged.price)} <small>/gal · you, ${e(shortDate(logged.at))}</small></strong>
       <button class="chip-clear" type="button" data-clear-price="${e(fuel)}" aria-label="Remove your ${FUEL_META[fuel].label} price">×</button>`
    : `<em>${listing}</em>`;
  return `<div class="fuel-chip fuel-${fuel}"><span>${FUEL_META[fuel].label}</span>${price}</div>`;
}

function sourceLine(station) {
  const parts = [];
  if (station.osm) parts.push('OpenStreetMap contributors');
  if (station.doe) parts.push(`U.S. Dept. of Energy${station.verified ? ` (E85 verified ${formatVerified(station.verified)})` : ''}`);
  const url = sourceUrl(station);
  const link = url ? ` · <a href="${e(url)}" target="_blank" rel="noopener noreferrer">Check or fix this listing ↗</a>` : '';
  return `<p class="detail-source">Source: ${e(parts.join(' + '))}${link}</p>`;
}

function priceForm(station) {
  const options = station.fuels.map((f) => `<option value="${f}">${FUEL_META[f].label}</option>`).join('');
  return `
    <form class="price-log" data-price-form="${e(station.id)}" novalidate>
      <label for="priceFuel">Saw a price here? Log it for yourself</label>
      <div class="price-log-row">
        <select id="priceFuel" name="fuel" aria-label="Fuel">${options}</select>
        <input id="priceValue" name="price" type="number" min="0.5" max="20" step="0.01" inputmode="decimal" placeholder="3.69" aria-label="Price per gallon in dollars" required>
        <button class="secondary-button" type="submit">Log price</button>
      </div>
    </form>`;
}

export function detailHtml(station, { saved = false, prices = {} }) {
  const phone = formatPhone(station.phone);
  const hours = formatHours(station.hours);
  const address = formatAddress(station) || 'Street address not listed';
  const miles = Number.isFinite(station.distance) ? formatMiles(station.distance) : '';
  return `
    <div class="detail-head">
      <div>
        <p class="detail-kicker">Selected stop${place(station) ? ` · ${e(place(station))}` : ''}</p>
        <h2 id="detailTitle">${e(station.name)}</h2>
        ${station.brand ? `<p class="detail-brand">${e(station.brand)}</p>` : ''}
        <p class="detail-address">${e(address)}${hours ? ` · ${e(hours)}` : ''}</p>
      </div>
      ${miles ? `<div class="detail-distance">${miles}<small>from search area</small></div>` : ''}
    </div>
    <div class="detail-fuels" data-station="${e(station.id)}">${station.fuels.map((f) => fuelChip(station, f, prices)).join('')}</div>
    ${priceForm(station)}
    <div class="detail-actions">
      <button class="secondary-button" type="button" data-save="${e(station.id)}" aria-pressed="${saved}">${saved ? '★ Saved' : '☆ Save'}</button>
      <a class="secondary-button" href="${e(directionsUrl(station))}" target="_blank" rel="noopener noreferrer">Directions ↗</a>
      ${phone ? `<a class="secondary-button" href="tel:${e(phone.tel)}">Call ${e(phone.display)}</a>` : ''}
      <button class="primary-button" type="button" data-plan="${e(station.id)}">Plan this stop →</button>
    </div>
    ${sourceLine(station)}`;
}

const fuelList = (fuels) => {
  const names = fuels.map((f) => FUEL_META[f].label);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0] || '';
};

export function emptyHtml({ savedOnly, fuels, radius }) {
  if (savedOnly) {
    return `<div class="empty-state"><strong>No saved stops yet</strong>Tap the star on any station to keep it here.
      <br><button type="button" data-show-all>Back to the locator</button></div>`;
  }
  if (!fuels.length) {
    return `<div class="empty-state"><strong>Pick a fuel</strong>Choose kerosene, diesel or E85 above to see stations.
      <br><button type="button" data-all-fuels>Show all fuels</button></div>`;
  }
  const wider = [50, 100].filter((r) => r > radius)
    .map((r) => `<button type="button" data-radius="${r}">Search ${r} mi</button>`).join(' ');
  const kerosene = fuels.length === 1 && fuels[0] === 'kerosene'
    ? '<p class="empty-hint">Kerosene is rarely listed in public map data. Call ahead: many hardware and farm stores sell it by the can.</p>'
    : '';
  return `<div class="empty-state"><strong>No ${e(fuelList(fuels))} within ${radius} mi</strong>
    Try a wider search or another fuel.${wider ? `<br>${wider}` : ''}${kerosene}</div>`;
}

export function resultsSummary(count, { savedOnly, radius }) {
  const noun = count === 1 ? 'station' : 'stations';
  return savedOnly ? `${count} saved` : `${count.toLocaleString('en-US')} ${noun} · ${radius} mi`;
}
