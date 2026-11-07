'use strict';
const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');

const chromiumPath = process.env.CHROMIUM_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
module.exports = defineConfig({
  testDir: './test',
  testMatch: '**/browser.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: 'list',
  outputDir: './artifacts/playwright',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3117',
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 15000,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}), args: ['--no-sandbox'] },
  },
});
