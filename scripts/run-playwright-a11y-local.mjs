#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(rootDir, '.env.e2e');
const localEnvFile = path.join(rootDir, '.env.e2e.local');

const parsedEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
const parsedLocalEnv = fs.existsSync(localEnvFile)
  ? parseEnv(fs.readFileSync(localEnvFile, 'utf8'))
  : {};
const testEnv = {
  ...parsedEnv,
  ...parsedLocalEnv,
  ...process.env,
  VITE_APP_URL: 'http://localhost:3000',
  VITE_APP_VERSION: 'playwright-a11y-local',
  APP_TEST_ENV: 'test',
};

const requiredKeys = ['VITE_POCKETBASE_URL', 'E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD'];
const missingKeys = requiredKeys.filter(key => !testEnv[key]);

if (missingKeys.length > 0) {
  console.error('Missing required local Playwright accessibility environment values:');
  missingKeys.forEach(key => console.error(`- ${key}`));
  console.error('');
  console.error(
    `Add them to ${localEnvFile}, ${envFile}, or export them before running this command.`
  );
  process.exit(1);
}

for (const key of ['VITE_POCKETBASE_URL', 'E2E_APP_URL']) {
  const value = testEnv[key];
  if (!value && key === 'E2E_APP_URL') continue;

  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      throw new Error('Nonlocal target');
    }
  } catch {
    console.error(`${key} must be an HTTP(S) loopback URL without embedded credentials.`);
    process.exit(1);
  }
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const suites = [
  ['run', 'test:e2e:a11y:public'],
  ['run', 'test:e2e:a11y:authenticated'],
];

for (const args of suites) {
  const result = spawnSync(pnpm, args, {
    cwd: rootDir,
    env: testEnv,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
