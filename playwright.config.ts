import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8787', trace: 'retain-on-failure',
    launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1100, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm start', url: 'http://localhost:8787/healthz', reuseExistingServer: false,
    env: { NODE_ENV: 'test', STORE: 'memory', ENABLE_PREVIEW: 'true', HOST: '127.0.0.1', PORT: '8787', PUBLIC_ORIGIN: 'http://localhost:8787' },
  },
});
