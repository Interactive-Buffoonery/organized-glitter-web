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

const publicInventory =
  /[/\\]e2e[/\\](?:(?:home|public-accessibility|page-titles)\.spec\.ts|a11y[/\\]public-a11y\.spec\.ts)$/;
const publicWebkitInventory =
  /[/\\]e2e[/\\](?:(?:home|page-titles)\.spec\.ts|a11y[/\\]public-a11y\.spec\.ts)$/;
const chromiumSmokeInventory = [
  /[/\\]e2e[/\\]ci[/\\](?:authenticated-accessibility-smoke|change-password-accessibility|coloring-book-create-flow|form-draft-recovery|hosting-banner|unverified-login-recovery)\.spec\.ts$/,
  /[/\\]e2e[/\\]authenticated[/\\](?:archive-legacy-project-local|archive-recovery-local|archive-v3-restore-local|coloring-detail-errors-local|coloring-page-detail|diamond-pagination-url|notes-feed-timeline|project-create-cover-local|project-delete-atomic-local|project-field-clearing|project-inline-dates-local)\.spec\.ts$/,
];
const webkitFlowInventory = [
  /[/\\]e2e[/\\]ci[/\\](?:change-password-accessibility|coloring-book-create-flow|form-draft-recovery|hosting-banner|mobile-webkit-smoke|unverified-login-recovery)\.spec\.ts$/,
  /[/\\]e2e[/\\]authenticated[/\\](?:archive-v3-restore-local|avatar-crop-local|coloring-detail-errors-local|coloring-page-detail|notes-feed-timeline|project-create-cover-local|project-field-clearing|project-inline-dates-local|randomizer-interruption-local)\.spec\.ts$/,
  /[/\\]e2e[/\\]authenticated[/\\]int-1093-filter-validation\.spec\.ts$/,
];
const chromiumFullInventory = [
  ...chromiumSmokeInventory,
  /[/\\]e2e[/\\]a11y[/\\]authenticated-a11y\.spec\.ts$/,
  /[/\\]e2e[/\\]authenticated[/\\](?:avatar-crop-local|concurrent-edit-local|int-1093-filter-validation|notes-feed-keyset-pagination|route-mount|randomizer-interruption-local)\.spec\.ts$/,
];

const setupProject: Project = {
  name: 'setup',
  testMatch: /auth\.setup\.ts$/,
  use: { ...devices['Desktop Chrome'] },
};

const smokeProjects: Project[] = [
  setupProject,
  {
    name: 'public-chromium-smoke',
    testMatch: [
      /[/\\]e2e[/\\]home\.spec\.ts$/,
      /[/\\]e2e[/\\]ci[/\\]public-accessibility-smoke\.spec\.ts$/,
    ],
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
    testMatch:
      /[/\\]e2e[/\\]ci[/\\](?:change-password-accessibility|form-draft-recovery|hosting-banner|mobile-webkit-smoke|unverified-login-recovery)\.spec\.ts$/,
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
    name: 'public-webkit-full',
    testMatch: publicWebkitInventory,
    use: { ...devices['Desktop Safari'] },
  },
  {
    name: 'authenticated-webkit-full',
    testMatch: webkitFlowInventory,
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
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT, open: 'never' }],
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
