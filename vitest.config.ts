import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Historical suites authenticate against Central. Keep the tests available,
    // but never run that data-mutating harness as part of the default command.
    exclude: process.env.RUN_LEGACY_GC_TESTS === '1' ? [] : [
      'tests/e2e/**',
      'tests/integration/tenant-isolation.test.ts',
      'tests/integration/backup-restore.test.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000
  },
  resolve: {
    alias: {
      '@gc/contracts': new URL('./packages/contracts/src/index.ts', import.meta.url).pathname,
      '@gc/database': new URL('./packages/database/src/index.ts', import.meta.url).pathname,
      '@gc/platform': new URL('./packages/platform/src/index.ts', import.meta.url).pathname
    }
  }
});
