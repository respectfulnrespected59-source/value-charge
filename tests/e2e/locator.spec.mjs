import { expect, test } from '@playwright/test';
import { allowErrors, assertClean, listedCount, mapIdle, NOMINATIM, openApp, PHOTON, prepare } from './helpers.mjs';

const milesOf = (texts) => texts.map((t) => Number.parseFloat(t));

test.afterEach(async ({ page }) => assertClean(page));

test('opens on real stations around Austin, with the map in step with the list', async ({ page }) => {
  const { calls, errors } = await prepare(page);
  await openApp(page);
  const count = await listedCount(page);
  expect(count).toBeGreaterThan(20);
  await expect(page.locator('.station-card')).toHaveCount(Math.min(50, count));
  await expect(page.locator('#map')).toHaveAttribute('data-count', String(count));
  const firstName = await page.locator('.station-card .station-name').first().textContent();
  await expect(page.locator('#detailTitle')).toHaveText(firstName);
  const miles = milesOf(await page.locator('.station-meta strong').allTextContents());
  expect(miles).toEqual([...miles].sort((a, b) => a - b));
  expect(Math.max(...miles)).toBeLessThanOrEqual(25);
  await expect(page.locator('#heroEyebrow')).toContainText('stations listed');
  await expect(page.locator('#dataDates')).toContainText('Listings updated');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
  expect(calls.other).toEqual([]);
  expect(calls.nominatim, 'the default area needs no place search').toEqual([]);
});

test('a ZIP search moves the search area, the URL, and survives a reload', async ({ page }) => {
  await prepare(page, { nominatim: (url) => (url.searchParams.get('postalcode') === '78664' ? NOMINATIM.roundRockZip : []) });
  await openApp(page);
  await page.locator('#locationSearch').fill('78664');
  await page.locator('#locationSearch').press('Enter');
  await expect(page.locator('#searchMessage')).toHaveText('Showing stations near 78664 · Round Rock, TX.');
  await expect(page.locator('#mapAreaLabel')).toHaveText('78664 · Round Rock, TX search area');
  await expect(page).toHaveURL(/lat=30\.4869&lng=-97\.6498/);
  expect(await listedCount(page)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#locationSearch')).toHaveValue('78664 · Round Rock, TX');
  await expect(page.locator('#mapAreaLabel')).toContainText('Round Rock');
});

test('when Nominatim is down, Photon still finds the place', async ({ page }) => {
  const { calls } = await prepare(page, { nominatim: () => 503, photon: () => PHOTON.denver });
  allowErrors(page, /status of 503/); // the browser logs the simulated outage itself
  await openApp(page);
  await page.locator('#locationSearch').fill('Denver');
  await page.locator('#searchSubmit').click();
  await expect(page.locator('#mapAreaLabel')).toHaveText('Denver, CO search area');
  await expect(page.locator('.station-card').first()).toBeVisible();
  expect(calls.nominatim.length).toBe(1);
  expect(calls.photon.length).toBe(1);
});

test('an unknown place says so and keeps the stations already shown', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const before = await listedCount(page);
  await page.locator('#locationSearch').fill('Atlantis, ZZ');
  await page.locator('#searchSubmit').click();
  await expect(page.locator('#searchMessage')).toContainText('could not find that place');
  await expect(page.locator('#searchMessage')).toHaveClass(/is-error/);
  await expect(page.locator('#locationSearch')).toHaveAttribute('aria-invalid', 'true');
  expect(await listedCount(page)).toBe(before);
});

test('fuel filters narrow the list to stations listed with that fuel', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  await page.locator('[data-fuel="kerosene"]').click();
  await page.locator('[data-fuel="e85"]').click();
  await expect(page.locator('[data-fuel="diesel"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-fuel="e85"]')).toHaveAttribute('aria-pressed', 'false');
  for (const chips of await page.locator('.station-card .mini-prices').allTextContents()) expect(chips).toContain('D');
  await page.locator('[data-fuel="diesel"]').click();
  await page.locator('[data-fuel="e85"]').click();
  expect(await listedCount(page)).toBeGreaterThan(0);
  for (const chips of await page.locator('.station-card .mini-prices').allTextContents()) expect(chips).toContain('E85');
  await page.locator('[data-fuel="e85"]').click();
  await expect(page.locator('#resultsList .empty-state')).toContainText('Pick a fuel');
  await page.locator('[data-all-fuels]').click();
  await expect(page.locator('.fuel-filter[aria-pressed="true"]')).toHaveCount(3);
});

test('kerosene-only in empty country is honest about it and widens on request', async ({ page }) => {
  await prepare(page);
  await openApp(page, '/?q=West+Texas&lat=31.2&lng=-104.6&fuels=kerosene&r=5');
  await expect(page.locator('#resultsList .empty-state')).toContainText('No Kerosene within 5 mi');
  await expect(page.locator('.empty-hint')).toContainText('hardware and farm stores');
  await page.locator('[data-radius="100"]').click();
  await expect(page.locator('#radiusSelect')).toHaveValue('100');
  await expect(page).toHaveURL(/r=100/);
});

test('a saved station survives a reload and fills the Saved view', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const name = await page.locator('.station-card .station-name').first().textContent();
  await page.locator('.station-card .save-button').first().click();
  await expect(page.locator('#toast')).toContainText('saved on this device');
  await expect(page.locator('#savedCount')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#savedCount')).toHaveText('1');
  await page.locator('[data-view="saved"]').click();
  await expect(page.locator('#resultsTitle')).toHaveText('Saved stations');
  await expect(page.locator('.station-card')).toHaveCount(1);
  await expect(page.locator('.station-card .station-name')).toHaveText(name);
  await page.locator('.station-card .save-button').click();
  await expect(page.locator('#resultsList .empty-state')).toContainText('No saved stops yet');
  await page.locator('[data-show-all]').click();
  await expect(page.locator('#resultsTitle')).toHaveText('Nearby stations');
});

test('a logged price shows on the card, drives the price sort, and can be removed', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const third = page.locator('.station-card').nth(2);
  const name = await third.locator('.station-name').textContent();
  await third.locator('.station-main').click();
  await expect(page.locator('#detailTitle')).toHaveText(name);
  await page.locator('#priceValue').fill('3.19');
  await page.locator('.price-log button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('at $3.19');
  await expect(page.locator('.station-card.is-selected .mini-prices')).toContainText('$3.19');
  await page.locator('#sortSelect').selectOption('price');
  await expect(page.locator('.station-card .station-name').first()).toHaveText(name);
  await page.locator('.chip-clear').click();
  await expect(page.locator('.station-card.is-selected .mini-prices')).not.toContainText('$');
});

test('a price outside $0.50-$20 is refused', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  await page.locator('#priceValue').fill('45');
  await page.locator('.price-log button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('between $0.50 and $20.00');
  await expect(page.locator('#priceValue')).toHaveAttribute('aria-invalid', 'true');
});

test('the calculator does the math, remembers the price, and refuses nonsense', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  await page.locator('#openCalculator').click();
  await expect(page.locator('#plannerDialog')).toBeVisible();
  await page.locator('#plannerGallons').fill('12.5');
  await page.locator('#plannerPrice').fill('3.40');
  await page.locator('#plannerForm button[type="submit"]').click();
  await expect(page.locator('#planResult strong')).toHaveText('$42.50');
  await page.locator('#plannerPrice').fill('0');
  await page.locator('#plannerForm button[type="submit"]').click();
  await expect(page.locator('#planResult')).toBeHidden();
  await expect(page.locator('#plannerNote')).toHaveClass(/is-error/);
  await page.locator('#closePlanner').click();
  await expect(page.locator('#plannerDialog')).toBeHidden();
  await expect(page.locator('.station-card.is-selected .mini-prices')).toContainText('$3.40');
});

test('a shared link restores the whole search without a place lookup', async ({ page }) => {
  const { calls } = await prepare(page);
  await openApp(page, '/?q=Denver%2C+CO&lat=39.7392&lng=-104.9903&fuels=e85&r=50&sort=name');
  await expect(page.locator('#locationSearch')).toHaveValue('Denver, CO');
  await expect(page.locator('[data-fuel="e85"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-fuel="diesel"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#radiusSelect')).toHaveValue('50');
  await expect(page.locator('#sortSelect')).toHaveValue('name');
  const names = await page.locator('.station-card .station-name').allTextContents();
  expect(names.length).toBeGreaterThan(1);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  expect(calls.nominatim).toEqual([]);
});

test('hostile station data shows up as plain text, never as markup', async ({ page }) => {
  await prepare(page);
  const evil = '<img src=x onerror="window.__pwned=1">';
  await page.route('**/data/tiles/30_-98.json', (route) => route.fulfill({
    json: { v: 1, key: '30_-98', stations: [{ id: 'osm-n1', name: evil, street: '<script>window.__pwned=2</script>', hours: '<b>bold</b>', lat: 30.2672, lng: -97.7431, fuels: ['diesel'] }] },
  }));
  await openApp(page);
  await expect(page.locator('.station-card .station-name', { hasText: '<img' }).first()).toHaveText(evil);
  await expect(page.locator('#detailTitle')).toHaveText(evil);
  await expect(page.locator('#resultsList img, #stationDetail img, #stationDetail script, #stationDetail b')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('tapping a dot on the map selects that station', async ({ page, isMobile }) => {
  await prepare(page);
  await openApp(page);
  await page.locator('#map').scrollIntoViewIfNeeded();
  await mapIdle(page);
  // Pick a numbered dot with clear space around it, so the tap cannot hit a neighbour.
  const target = await page.evaluate(() => {
    const map = window.__vcMap;
    const box = map.getContainer().getBoundingClientRect();
    const all = map.queryRenderedFeatures({ layers: ['station-dot'] })
      .map((f) => ({ id: f.properties.id, name: f.properties.name, p: map.project(f.geometry.coordinates) }));
    // Candidates stay clear of the controls at the edges; neighbours count from EVERY dot.
    const lonely = all
      .filter((d) => d.p.x > 40 && d.p.y > 40 && d.p.x < box.width - 60 && d.p.y < box.height - 40)
      .find((d) => all.every((o) => o === d || Math.hypot(o.p.x - d.p.x, o.p.y - d.p.y) > 30));
    return lonely && { ...lonely, x: box.left + lonely.p.x, y: box.top + lonely.p.y };
  });
  expect(target, 'a dot with room around it').toBeTruthy();
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, target)).toBe('CANVAS');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  if (isMobile) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expect(page.locator('#detailTitle')).toHaveText(target.name);
  await expect(page.locator('#map')).toHaveAttribute('data-selected', target.id);
  await expect(page.locator('.station-card.is-selected .station-name')).toHaveText(target.name);
  expect(await page.evaluate(() => window.scrollY), 'tapping the map must not scroll the page').toBe(scrollBefore);
});

test('where two dots overlap, a tap picks the one nearest the finger', async ({ page, isMobile }) => {
  await prepare(page);
  // Two planted stations ~6-8 px apart at the 25 mi view, so one tap lands on both dots.
  // Tapping each centre in turn must select each one: no "first/topmost wins" rule passes both.
  const near = { id: 'osm-n1', name: 'Near Pump', lat: 30.2672, lng: -97.7431, fuels: ['diesel'] };
  const far = { id: 'osm-n2', name: 'Far Pump', lat: 30.2672, lng: -97.7281, fuels: ['diesel'] };
  for (const key of ['30_-98', '30_-100']) {
    await page.route(`**/data/tiles/${key}.json`, (route) => route.fulfill({
      json: { v: 1, key, stations: key === '30_-98' ? [near, far] : [] },
    }));
  }
  await openApp(page);
  await page.locator('#map').scrollIntoViewIfNeeded();
  await mapIdle(page);
  const geometry = await page.evaluate(() => {
    const map = window.__vcMap;
    const box = map.getContainer().getBoundingClientRect();
    const a = map.project([-97.7431, 30.2672]);
    const b = map.project([-97.7281, 30.2672]);
    const radius = map.getPaintProperty('station-dot', 'circle-radius');
    return {
      gap: Math.hypot(b.x - a.x, b.y - a.y), zoom: map.getZoom(), radius,
      near: { x: box.left + a.x, y: box.top + a.y }, far: { x: box.left + b.x, y: box.top + b.y },
      hitsAtNear: map.queryRenderedFeatures([a.x, a.y], { layers: ['station-dot'] }).length,
    };
  });
  expect(geometry.gap, `dots must overlap for this test to mean anything (zoom ${geometry.zoom})`).toBeLessThan(14);
  expect(geometry.hitsAtNear, 'a tap on one centre lands on both dots').toBe(2);
  const tap = (p) => (isMobile ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
  await tap(geometry.far);
  await expect(page.locator('#map')).toHaveAttribute('data-selected', far.id);
  await expect(page.locator('#detailTitle')).toHaveText('Far Pump');
  // Two taps inside ~300 ms are a double-tap (zoom) on a phone, not two selections: wait it out.
  await page.waitForTimeout(700);
  await mapIdle(page);
  expect(await page.evaluate(() => window.__vcMap.getZoom())).toBeCloseTo(geometry.zoom, 5);
  await tap(geometry.near); // now under the gold ring of the selected "Far"
  await expect(page.locator('#map')).toHaveAttribute('data-selected', near.id);
  await expect(page.locator('#detailTitle')).toHaveText('Near Pump');
});

test('a failed station download offers a retry that works', async ({ page }) => {
  await prepare(page);
  allowErrors(page, /status of 503|could not load stations/);
  await page.route('**/data/tiles/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await expect(page.locator('#resultsList')).toContainText('Could not load stations');
  await page.unroute('**/data/tiles/**');
  await page.locator('[data-retry]').click();
  await expect(page.locator('.station-card').first()).toBeVisible();
});

test('typing a listed station name exactly selects it without a place search', async ({ page }) => {
  const { calls } = await prepare(page);
  await openApp(page);
  const names = await page.locator('.station-card .station-name').allTextContents();
  const name = names.slice(3).find((n) => n.length >= 4);
  await page.locator('#locationSearch').fill(name.toUpperCase());
  await page.locator('#searchSubmit').click();
  await expect(page.locator('#searchMessage')).toContainText('selected');
  await expect(page.locator('#detailTitle')).toHaveText(name);
  expect(calls.nominatim).toEqual([]);
});

test('a place that only starts like a station name is searched as a place', async ({ page }) => {
  const { calls } = await prepare(page, { nominatim: () => NOMINATIM.roundRockZip });
  await openApp(page);
  const name = (await page.locator('.station-card .station-name').allTextContents()).find((n) => n.length >= 5);
  await page.locator('#locationSearch').fill(name.slice(0, -1)); // a prefix, not the name
  await page.locator('#searchSubmit').click();
  await expect(page.locator('#searchMessage')).toContainText('Showing stations near');
  expect(calls.nominatim.length).toBe(1);
});

test('a shared link for the default area is not replaced by the last search', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('vc.search.v1', JSON.stringify({ q: 'Denver, CO', lat: 39.7392, lng: -104.9903 }));
  });
  await openApp(page, '/?r=50');
  await expect(page.locator('#mapAreaLabel')).toHaveText('Austin, TX search area');
  await openApp(page, '/');
  await expect(page.locator('#mapAreaLabel')).toHaveText('Denver, CO search area', { timeout: 10000 });
});

test('the calculator opens on the selected station even past the first page', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  test.skip((await listedCount(page)) <= 60, 'needs more than one page of stations');
  await page.locator('[data-show-more]').click();
  const card = page.locator('.station-card').nth(59);
  const name = await card.locator('.station-name').textContent();
  await card.locator('.station-main').click();
  await page.locator('#stationDetail [data-plan]').click();
  await expect(page.locator('#plannerStation option:checked')).toHaveText(name);
});

test('keyboard focus stays on the card you just chose', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const second = page.locator('.station-card').nth(1).locator('.station-main');
  const id = await second.getAttribute('data-select');
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.station-card.is-selected .station-main')).toHaveAttribute('data-select', id);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-select'))).toBe(id);
});

test('a half-typed price survives the page updating around it', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  await page.locator('#priceValue').fill('3.4');
  await page.locator('.station-card').nth(0).locator('.save-button').click(); // re-renders the list
  await expect(page.locator('#priceValue')).toHaveValue('3.4');
});

test('Show more reveals the next page of stations', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const count = await listedCount(page);
  test.skip(count <= 50, 'needs more than one page of stations');
  await page.locator('[data-show-more]').click();
  await expect(page.locator('.station-card')).toHaveCount(Math.min(100, count));
});

test('Directions opens Google Maps for the selected station in a new tab', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const link = page.locator('#stationDetail a', { hasText: 'Directions' });
  await expect(link).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=30\.\d+%2C-97\.\d+$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});

test('the page never scrolls sideways, down to a 320 px phone', async ({ page }) => {
  await prepare(page);
  await openApp(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test.describe('location', () => {
  test.use({ geolocation: { latitude: 30.50831, longitude: -97.67894 }, permissions: ['geolocation'] });

  test('Use my location searches around the device, rounded to about 1 km', async ({ page }) => {
    await prepare(page);
    await openApp(page);
    await page.locator('#locateButton').click();
    await expect(page.locator('#searchMessage')).toHaveText('Showing stations near you.');
    await expect(page.locator('#mapAreaLabel')).toHaveText('Your location search area');
    await expect(page).toHaveURL(/lat=30\.51&lng=-97\.68(&|$)/);
    expect(await page.evaluate(() => window.localStorage.getItem('vc.search.v1'))).not.toContain('30.508');
  });
});

test.describe('location blocked', () => {
  test.use({ permissions: [] });

  test('a blocked location explains what to do instead', async ({ page }) => {
    await prepare(page);
    await openApp(page);
    await page.locator('#locateButton').click();
    await expect(page.locator('#searchMessage')).toHaveText(/turned off for this site|Could not find your location/);
    await expect(page.locator('#searchMessage')).toHaveClass(/is-error/);
  });
});
