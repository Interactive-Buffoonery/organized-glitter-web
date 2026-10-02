import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const required = [
  'E2E_APP_URL',
  'E2E_TEST_EMAIL',
  'E2E_TEST_PASSWORD',
  'VITE_POCKETBASE_URL',
  'E2E_COLORING_BOOK_ID',
  'E2E_COLORING_PAGE_ID',
];
const missing = required.filter(key => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing hosted QA environment keys: ${missing.join(', ')}`);
}

const target = new URL(process.env.E2E_APP_URL);
if (target.protocol !== 'https:' || target.search || target.hash) {
  throw new Error('E2E_APP_URL must be a clean HTTPS URL without access tokens');
}

const accessState = process.env.E2E_ACCESS_STORAGE_STATE;
const storageState = process.env.E2E_STORAGE_STATE;
if (storageState !== undefined && !storageState.trim()) {
  throw new Error('E2E_STORAGE_STATE must be a non-empty path when set');
}
if (storageState && (path.isAbsolute(storageState) || storageState.split(/[\\/]/).includes('..'))) {
  throw new Error('E2E_STORAGE_STATE must stay within the repo');
}
if (accessState && !existsSync(path.resolve(accessState))) {
  throw new Error('E2E_ACCESS_STORAGE_STATE does not point to an existing file');
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.resolve('.tmp/spacefast-preview-qa', runId);
const reportDir = path.join(runDir, 'playwright-report');
const resultsDir = path.join(runDir, 'test-results');
mkdirSync(runDir, { recursive: true });

const command = ['exec', 'playwright', 'test', '--config=playwright.spacefast.config.ts'];
console.info(`Spacefast target: ${target.origin}`);
console.info('Scope: paced, read-only public, authenticated, and mobile journeys');
console.info(`Report: ${reportDir}`);

const startedAt = new Date().toISOString();
const result = spawnSync('pnpm', command, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SPACEFAST_QA_RUN: '1',
    PLAYWRIGHT_HTML_REPORT: reportDir,
    PLAYWRIGHT_OUTPUT_DIR: resultsDir,
  },
});
const exitCode = result.status ?? 1;

writeFileSync(
  path.join(runDir, 'run.json'),
  `${JSON.stringify(
    {
      target: target.origin,
      command: 'pnpm test:e2e:spacefast',
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode,
      report: reportDir,
      results: resultsDir,
    },
    null,
    2
  )}\n`
);

process.exit(exitCode);
