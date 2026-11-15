// The offline copy (public/sw.js) running for real: the other specs block it so page.route()
// sees every request; here it is allowed, and context.route() reaches the worker's fetches.
import { expect, test } from '@playwright/test';
import { allowErrors, assertClean, openApp, prepare } from './helpers.mjs';

test.use({ serviceWorkers: 'allow' });
test.afterEach(async ({ page }) => assertClean(page));

async function underWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('.station-card').first()).toBeVisible();
}

test('after one visit the app opens offline with the stations it saw', async ({ page, context }) => {
  await prepare(page);
  allowErrors(page, /map unavailable|map style|Failed to fetch|ERR_INTERNET_DISCONNECTED|map:/);
  await openApp(page);
  await underWorker(page);
  const names = await page.locator('.station-card .station-name').allTextContents();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.station-card').first()).toBeVisible();
  expect(await page.locator('.station-card .station-name').allTextContents()).toEqual(names);
  await context.setOffline(false);
});

test('a new deploy shows up on the next visit (fresh code first, not the saved copy)', async ({ page, context }) => {
  await prepare(page);
  await openApp(page);
  await underWorker(page);
  await context.route('**/js/app.js', async (route) => {
    const original = await route.fetch();
    await route.fulfill({ response: original, body: `${await original.text()}\nwindow.__freshDeploy = true;\n` });
  });
  await page.reload();
  await expect(page.locator('.station-card').first()).toBeVisible();
  expect(await page.evaluate(() => window.__freshDeploy)).toBe(true);
});

test('a server error mid-deploy is answered with the saved copy', async ({ page, context }) => {
  await prepare(page);
  await openApp(page);
  await underWorker(page);
  allowErrors(page, /status of 503/);
  await context.route('**/js/lib/render.js', (route) => route.fulfill({ status: 503, body: 'deploying' }));
  await page.reload();
  await expect(page.locator('.station-card').first()).toBeVisible();
});
