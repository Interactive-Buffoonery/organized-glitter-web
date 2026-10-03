/**
 * Playwright config for local route-mount smoke tests.
 *
 * Scope: a fast pre-merge sanity run against the real browser for the class
 * of bug jsdom can't catch
 * (CSS-gated paths, real-browser event timing, service worker registration,
 * Radix primitives under real layout). See
 * `src/pages/__tests__/*-mount-smoke.test.tsx` for the jsdom companions.
 *
 * Invocation:
 *   pnpm exec playwright test           # run all tests headless
 *   pnpm exec playwright test --ui      # interactive debugger
 *   pnpm exec playwright test --headed  # see the browser window
 *
 * The `webServer` block below boots `pnpm dev` before the test suite and
 * shuts it down after. CI passes VITE_POCKETBASE_URL, E2E_TEST_EMAIL, and
 * E2E_TEST_PASSWORD as repository secrets. Local runs may export the same
 * variables or keep the login credentials in `.env.e2e` / `.env.e2e.local`.
 * Interactive local runs may reuse an existing server. Accessibility runs
 * set APP_TEST_ENV=test and require a fresh server without developer overlays.
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { parseEnv } from 'node:util';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = process.env.E2E_STORAGE_STATE
  ? path.resolve(rootDir, process.env.E2E_STORAGE_STATE)
  : path.join(rootDir, 'e2e', '.auth', 'user.json');
const envFile = path.join(rootDir, '.env.e2e');
const localEnvFile = path.join(rootDir, '.env.e2e.local');
const appUrl = process.env.E2E_APP_URL || 'http://localhost:3000';
const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND || 'pnpm dev';
const playwrightOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results';
const playwrightReportDir = process.env.PLAYWRIGHT_HTML_REPORT || 'playwright-report';

const readEnvFile = (filePath: string) =>
  fs.existsSync(filePath) ? parseEnv(fs.readFileSync(filePath, 'utf8')) : {};

const fileEnv = {
  ...readEnvFile(envFile),
  ...readEnvFile(localEnvFile),
};

for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const E2E_ENV_KEYS = [
  'VITE_POCKETBASE_URL',
  'E2E_TEST_EMAIL',
  'E2E_TEST_PASSWORD',
  'E2E_FIXTURE_PROJECT_ID',
] as const;

const e2eEnv = Object.fromEntries(
  E2E_ENV_KEYS.flatMap(key => (process.env[key] ? [[key, process.env[key]!]] : []))
);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  // Fail the test suite if test.only is left in source.
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 1 : 1,

  // Serialize locally so the login fixture can reuse the dev server cleanly.
  // CI would parallelize once we have isolated test backends.
  workers: 1,

  reporter: [['list'], ['html', { outputFolder: playwrightReportDir, open: 'never' }]],
  outputDir: playwrightOutputDir,

  use: {
    baseURL: appUrl,
    // Capture traces on the first retry; keep artifacts on failure only.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      // Runs first. Logs in via the real /login form and writes a
      // storageState file that every other project reuses. See
      // e2e/fixtures/auth.setup.ts.
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
    {
      // Public (unauthenticated) tests. Run in parallel with nothing that
      // depends on login state.
      name: 'public',
      testMatch:
        /[/\\]e2e[/\\](?:(?:home|pwa-safe-area|public-accessibility|links-accessibility|page-titles)\.spec\.ts|a11y[/\\]public-a11y\.spec\.ts)$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Authenticated route-mount sweep. Depends on the setup project so
      // storageState is ready before these tests run.
      name: 'authenticated',
      testMatch:
        /[/\\]e2e[/\\](?:authenticated[/\\].*|a11y[/\\](?:authenticated-a11y|mobile-state-a11y))\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },
    {
      // Local visual review atlas. Uses authenticated state so one inventory
      // can include both public and signed-in screens.
      name: 'screen-review-desktop',
      testMatch: /screen-review\/screen-review\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },
    {
      name: 'screen-review-mobile-chrome',
      testMatch: /screen-review\/screen-review\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 5'],
        storageState: STORAGE_STATE,
      },
    },
    {
      name: 'screen-review-mobile-safari',
      testMatch: /screen-review\/screen-review\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 13'],
        storageState: STORAGE_STATE,
      },
    },
  ],

  webServer:
    process.env.E2E_QA_SUITE === 'legacy'
      ? undefined
      : {
          command: webServerCommand,
          url: appUrl,
          reuseExistingServer: !process.env.CI && process.env.APP_TEST_ENV !== 'test',
          timeout: 120_000,
          env: {
            // Dev server expects a build identifier even in dev mode when browser
            // tests run outside a deployment environment.
            VITE_APP_VERSION: 'playwright-local',
            // Keep dev-only overlays out of browser tests; they can intercept mobile
            // taps and are not part of the production accessibility surface.
            VERCEL_ENV: 'test',
            ...e2eEnv,
            APP_TEST_ENV: 'test',
          },
          // Let the dev server inherit the parent env so CI secrets and Vite's
          // local env-file auto-loader both work.
          cwd: rootDir,
        },
});
