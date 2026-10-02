import { defineConfig } from '@playwright/test';

const outputRoot = process.env.LANDING_QA_DIR ?? './.local/landing-qa';

// This suite uses fresh anonymous browser contexts and mocks every API request.
// It never imports tenant fixtures, starts services, or uses stored credentials.
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/public-landing.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `${outputRoot}/test-results`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${outputRoot}/report`, open: 'never' }],
    ['json', { outputFile: `${outputRoot}/results.json` }],
  ],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    browserName: 'chromium',
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'landing-mobile-320', use: { viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true } },
    { name: 'landing-mobile-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'landing-tablet-768', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    // Reflow equivalent to a 1440 × 1000 desktop viewed at 200% browser zoom.
    { name: 'landing-desktop-200-percent-reflow', use: { viewport: { width: 720, height: 500 } } },
    { name: 'landing-desktop-1440', use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
