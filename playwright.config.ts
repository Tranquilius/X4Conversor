import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    // Invokes vite directly (not via "npm run") to avoid an extra shell
    // wrapper process that Windows doesn't kill cleanly at the end of the
    // tests, which can hang the Playwright worker's shutdown.
    command: 'npx vite preview --port 4173',
    url: 'http://localhost:4173/X4Conversor/',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173/X4Conversor/',
    trace: 'on-first-retry',
  },
});
