import { defineConfig } from '@playwright/test';

try { process.loadEnvFile?.('.env'); } catch { /* The fixture validates literal local targets. */ }

export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['device-signer-storage.spec.ts', 'premium-nominations.spec.ts'],
  timeout: 360_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: './.local/device-session-browser-results',
  reporter: [['list'], ['json', { outputFile: 'docs/premium-evidence/2026-10-02/device-session-browser-results.json' }]],
  // Secrets and encrypted backups must not enter screenshots, traces or videos.
  use: { baseURL: 'http://localhost:3000', actionTimeout: 20_000, navigationTimeout: 30_000,
    trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block', acceptDownloads: true },
  projects: [{ name: 'device-session-isolated-chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } }],
});
