import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4199/ljubljana-airport/GoOpti-brnik-nov24/', trace: 'off' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'chrome' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } },
  ],
  webServer: { command: 'npm run build && npx vite preview --port 4199 --strictPort', port: 4199, reuseExistingServer: true, timeout: 120_000 },
});
