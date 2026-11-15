// One check against the REAL outside services (OpenFreeMap tiles, Nominatim). Skipped unless
// REAL=1, so the normal suite never depends on someone else's uptime or rate limits.
// REAL=1 npx playwright test real.spec --project=laptop
import { expect, test } from '@playwright/test';

test.skip(!process.env.REAL, 'set REAL=1 to check the real map and place-search services');

test('real map tiles render in the brand colours and a real ZIP search works', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('/');
  await page.waitForSelector('#map[data-ready="true"]');
  await page.evaluate(() => new Promise((resolve) => {
    const map = window.__vcMap;
    if (map.loaded() && !map.isMoving()) resolve();
    else map.once('idle', resolve);
  }));
  const map = await page.evaluate(() => ({
    cityLabels: window.__vcMap.queryRenderedFeatures({ layers: ['label_city'] }).length,
    roads: window.__vcMap.queryRenderedFeatures().filter((f) => f.layer.id.startsWith('highway')).length,
    background: window.__vcMap.getPaintProperty('background', 'background-color'),
  }));
  expect(map.cityLabels, 'real vector tiles drew city names').toBeGreaterThan(0);
  expect(map.roads, 'real vector tiles drew roads').toBeGreaterThan(0);
  expect(map.background).toBe('#efb99e');

  await page.locator('#locationSearch').fill('80202');
  await page.locator('#locationSearch').press('Enter');
  await expect(page.locator('#mapAreaLabel')).toContainText('Denver', { timeout: 15000 });
  await expect(page.locator('.station-card').first()).toBeVisible();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
