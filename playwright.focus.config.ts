import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: ['focus.spec.ts', 'ui-baseline.spec.ts'],
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:4186' },
  webServer: { command: 'pnpm preview --host 0.0.0.0 --port 4186 --strictPort', url: 'http://127.0.0.1:4186', reuseExistingServer: true },
})
