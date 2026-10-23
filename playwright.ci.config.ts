import { defineConfig, devices, type Project } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const storageState = process.env.E2E_STORAGE_STATE
  ? path.resolve(rootDir, process.env.E2E_STORAGE_STATE)
  : path.join(rootDir, 'e2e', '.auth', 'ci-user.json');
const appUrl = process.env.E2E_APP_URL || 'http://127.0.0.1:3000';
const isFullSuite = process.env.E2E_QA_SUITE === 'full';
if (!process.env.E2E_STORAGE_STATE) process.env.E2E_STORAGE_STATE = storageState;

const publicInventory = /[/\\]e2e[/\\]a11y[/\\]public-a11y\.spec\.ts$/;
export const chromiumSmokeInventory = [
  /[/\\]e2e[/\\]authenticated[/\\](?:account-deletion-local|archive-v3-restore-local|import-export-local|project-create-cover-local|project-delete-atomic-local|project-field-clearing|session-expiry-local)\.spec\.ts$/,
  /[/\\]e2e[/\\]ci[/\\]coloring-book-create-flow\.spec\.ts$/,
  /[/\\]e2e[/\\]a11y[/\\]authenticated-a11y\.spec\.ts$/,
];
export const webkitFlowInventory = [
  /[/\\]e2e[/\\]ci[/\\](?:mobile-webkit-smoke|coloring-book-create-flow)\.spec\.ts$/,
  /[/\\]e2e[/\\](?:pwa-safe-area|authenticated[/\\]account-deletion-local)\.spec\.ts$/,
];
export const chromiumFullInventory = chromiumSmokeInventory;

const setupProject: Project = {
  name: 'setup',
  testMatch: /auth\.setup\.ts$/,
  use: { ...devices['Desktop Chrome'] },
};

const smokeProjects: Project[] = [
  setupProject,
  {
    name: 'public-chromium-smoke',
    testMatch: publicInventory,
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'authenticated-chromium-smoke',
    testMatch: chromiumSmokeInventory,
    dependencies: ['setup'],
    use: { ...devices['Desktop Chrome'], storageState },
  },
  {
    name: 'mobile-webkit-smoke',
    testMatch: webkitFlowInventory,
    grep: /opens the bottom add menu|creates a book and edits|reverifies the same proof|safe.area/i,
    dependencies: ['setup'],
    use: { ...devices['iPhone 13'], storageState },
  },
];

const fullProjects: Project[] = [
  setupProject,
  {
    name: 'public-chromium-full',
    testMatch: publicInventory,
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'authenticated-chromium-full',
    testMatch: chromiumFullInventory,
    dependencies: ['setup'],
    use: { ...devices['Desktop Chrome'], storageState },
  },
  {
    name: 'authenticated-webkit-full',
    testMatch: webkitFlowInventory,
    grep: /opens the bottom add menu|creates a book and edits|reverifies the same proof|safe.area/i,
    dependencies: ['setup'],
    use: { ...devices['iPhone 13'], storageState },
  },
];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/screen-review/**',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  preserveOutput: 'never',
  reporter: [
    ['list'],
    [
      './scripts/playwright-safe-qa-reporter.mjs',
      { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE },
    ],
  ],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
  use: {
    baseURL: appUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: isFullSuite ? fullProjects : smokeProjects,
});
