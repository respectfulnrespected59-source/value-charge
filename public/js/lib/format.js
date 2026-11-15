// Display helpers. Everything that came from map data goes through escapeHtml
// before it touches innerHTML.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const DAY_NAMES = { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun' };
// "Mo-Fr 05:30-23:00" or "06:00-22:00": optional day list, then one time range.
const OSM_RULE = /^(?:([A-Z][a-z](?:\s*[-,]\s*[A-Z][a-z])*)\s+)?(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;
const ALWAYS_OPEN = /^(24\/7|24 hours daily|24 hours)$/i;

function formatTime(hours, minutes) {
  if (hours === 24 || (hours === 0 && minutes === 0)) return 'midnight';
  if (hours === 12 && minutes === 0) return 'noon';
  const suffix = hours < 12 ? 'AM' : 'PM';
  const h12 = hours % 12 || 12;
  return minutes ? `${h12}:${String(minutes).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

function formatDays(days) {
  if (!days || days.replace(/\s/g, '') === 'Mo-Su') return 'Daily';
  const out = [];
  for (const part of days.split(/(\s*[-,]\s*)/)) {
    const token = part.trim();
    if (token === '-') out.push('–');
    else if (token === ',') out.push(', ');
    else if (DAY_NAMES[token]) out.push(DAY_NAMES[token]);
    else return null;
  }
  return out.join('');
}

function formatRule(rule) {
  const m = rule.match(OSM_RULE);
  if (!m) return null;
  const [, days, h1, m1, h2, m2] = m;
  const [startH, startM, endH, endM] = [h1, m1, h2, m2].map(Number);
  if (startH > 24 || endH > 24 || startM > 59 || endM > 59) return null;
  const dayText = formatDays(days);
  if (!dayText) return null;
  const allDay = startH === 0 && startM === 0 && (endH === 24 || (endH === 23 && endM === 59));
  if (allDay && dayText === 'Daily') return { allDay: true, text: 'Open 24 hours' };
  return { allDay: false, text: `${dayText} ${formatTime(startH, startM)}–${formatTime(endH, endM)}` };
}

/** OSM opening_hours or DOE hours text -> something a driver reads at a glance. */
export function formatHours(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (ALWAYS_OPEN.test(text)) return 'Open 24 hours';
  const rules = text.split(/\s*;\s*/).filter(Boolean).map(formatRule);
  if (!rules.length || rules.some((r) => !r)) return text;
  if (rules.length === 1 && rules[0].allDay) return rules[0].text;
  return rules.map((r) => r.text).join(' · ');
}

/** A US phone number -> { display, tel } or null when it is not a full number. */
export function formatPhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return {
    display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    tel: `+1${digits}`,
  };
}

export function formatAddress(station) {
  const region = [station.state, station.zip].filter(Boolean).join(' ');
  return [station.street, station.city, region].filter(Boolean).join(', ');
}

export function formatMiles(miles) {
  return miles < 100 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

export function formatMoney(amount) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-11" -> "Aug 2026". */
export function formatVerified(isoDate) {
  const m = String(isoDate ?? '').match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function directionsUrl(station) {
  const params = new URLSearchParams({ api: '1', destination: `${station.lat},${station.lng}` });
  return `https://www.google.com/maps/dir/?${params}`;
}

const OSM_REF = /^(node|way|relation)\/\d+$/;

/** Where a driver can check or correct this listing. */
export function sourceUrl(station) {
  if (OSM_REF.test(station.osm || '')) return `https://www.openstreetmap.org/${station.osm}`;
  if (Number.isSafeInteger(station.doe)) return 'https://afdc.energy.gov/stations';
  return '';
}
