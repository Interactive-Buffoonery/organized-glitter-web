import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BLOG_QA_BASE_URL;
if (!baseURL) throw new Error('BLOG_QA_BASE_URL is required');

export default defineConfig({
  testDir: '.',
  testMatch: 'blog.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT || 'playwright-report', open: 'never' },
    ],
  ],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'blog-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'blog-mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
