import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
// BASE_URL=https://<live site> npx playwright test  -> the whole suite against the deployed site
// (outside services are still stubbed, so it tests the deployed code, not OpenFreeMap's uptime).
// REAL=1 npx playwright test real.spec  -> one check against the real map + place-search services.
const LIVE = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: LIVE || `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    // The offline worker would answer requests before page.route() sees them.
    serviceWorkers: 'block',
    launchOptions: { args: ['--mute-audio'] },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
  ],
  webServer: LIVE ? undefined : {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 15000,
  },
});
