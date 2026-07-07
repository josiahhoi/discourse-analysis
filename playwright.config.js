// Playwright config for the end-to-end browser test (tests/e2e/).
// `npm run test:e2e` starts the static server on 8766 (a port the dev preview
// doesn't use) and runs the spec against real Chromium.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8766',
  },
  webServer: {
    command: 'node tests/e2e/serve.js 8766',
    port: 8766,
    reuseExistingServer: true,
  },
});
