import { defineConfig } from '@playwright/test';

try { process.loadEnvFile?.('.env'); } catch { /* Harness validates its local target separately. */ }

export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['premium.spec.ts', 'premium-nominations.spec.ts'],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: './.local/premium-browser-results',
  reporter: [['list'], ['json', { outputFile: 'docs/premium-evidence/2026-10-01/browser-results.json' }]],
  use: { baseURL: 'http://localhost:3000', actionTimeout: 20_000, navigationTimeout: 20_000, trace: 'off', screenshot: 'off' },
  projects: [{ name: 'isolated-chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } }],
});
