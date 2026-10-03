#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const envFile = path.join(rootDir, '.env.e2e');
const localEnvFile = path.join(rootDir, '.env.e2e.local');

const readEnvFile = filePath =>
  fs.existsSync(filePath) ? parseEnv(fs.readFileSync(filePath, 'utf8')) : {};

const testEnv = {
  ...readEnvFile(envFile),
  ...readEnvFile(localEnvFile),
  ...process.env,
  VITE_APP_VERSION: 'playwright-screen-review',
  VERCEL_ENV: 'test',
};

const isCI = testEnv.CI === 'true';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const webkitExecutablePath = webkit.executablePath();
const hasWebKit = fs.existsSync(webkitExecutablePath);

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: rootDir,
    env: testEnv,
    stdio: 'inherit',
  });

const resetResult = run(process.execPath, ['e2e/screen-review/reset-artifacts.mjs']);
if (resetResult.error) {
  console.error(resetResult.error.message);
  process.exit(1);
}
if (resetResult.status !== 0) {
  process.exit(resetResult.status ?? 1);
}

if (!hasWebKit) {
  const installCommand = 'pnpm exec playwright install chromium webkit';
  if (isCI) {
    console.error(`Playwright WebKit is missing at ${webkitExecutablePath}.`);
    console.error(`Install browser dependencies before running screen review: ${installCommand}`);
    process.exit(1);
  }

  console.warn(
    `Skipping mobile Safari screen review because Playwright WebKit is missing at ${webkitExecutablePath}.`
  );
  console.warn(`Run ${installCommand} for full local browser coverage.`);
}

const projects = ['screen-review-desktop', 'screen-review-mobile-chrome'];
if (hasWebKit || isCI) {
  projects.push('screen-review-mobile-safari');
}

const playwrightArgs = [
  'exec',
  'playwright',
  'test',
  ...projects.map(project => `--project=${project}`),
];
const playwrightResult = run(pnpm, playwrightArgs);

const reportResult = run(process.execPath, ['e2e/screen-review/generate-report.mjs']);

if (playwrightResult.error) {
  console.error(playwrightResult.error.message);
}
if (reportResult.error) {
  console.error(reportResult.error.message);
}

const playwrightStatus = playwrightResult.error ? 1 : (playwrightResult.status ?? 0);
const reportStatus = reportResult.error ? 1 : (reportResult.status ?? 0);

process.exit(playwrightStatus || reportStatus);
