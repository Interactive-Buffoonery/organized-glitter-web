#!/usr/bin/env node
// Reconcile the managed smoke and full browser inventories with what Playwright actually
// discovers. This runs in the static phase (test:ci:static) because each listing starts a
// Playwright process, which does not belong inside the unit-test time budget.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { parseListedInventory } from './run-local-release-qa.mjs';

const require = createRequire(import.meta.url);
const LIST_TIMEOUT_MS = 90_000;
const OUTPUT_EXCERPT_CHARS = 2_000;

/** Synthetic fixture values so listing never needs real accounts or a running backend. */
export function discoveryEnv(suite, baseEnv = process.env) {
  return {
    ...baseEnv,
    E2E_QA_SUITE: suite,
    E2E_APP_URL: 'http://127.0.0.1:3000',
    VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
    E2E_TEST_EMAIL: 'inventory@example.test',
    E2E_TEST_PASSWORD: 'inventory-test-password',
    E2E_FIXTURE_PROJECT_ID: 'localproject003',
    E2E_COLORING_BOOK_ID: 'localbook000001',
    E2E_COLORING_PAGE_ID: 'localpage000001',
    E2E_COLORING_MEDIUM_ID: 'localmedium0001',
    E2E_RANDOMIZER_PROJECT_IDS: Array.from(
      { length: 8 },
      (_, index) => `localproject00${index + 1}`
    ).join(','),
  };
}

/** Run a child process and stop it if it outlives `timeoutMs`. */
export function runBoundedCommand(command, args, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', status => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs} ms.`));
        return;
      }
      resolve({ status, stdout, stderr });
    });
  });
}

const excerpt = text => text.trim().slice(-OUTPUT_EXCERPT_CHARS);

export async function checkBrowserDiscovery({
  run = runBoundedCommand,
  suites = ['smoke', 'full'],
  timeoutMs = LIST_TIMEOUT_MS,
} = {}) {
  const cli = require.resolve('@playwright/test/cli');
  const discovered = {};
  for (const suite of suites) {
    const { status, stdout, stderr } = await run(
      process.execPath,
      [cli, 'test', '--config=playwright.ci.config.ts', '--list'],
      { env: discoveryEnv(suite), timeoutMs }
    );
    if (status !== 0) {
      throw new Error(
        `Playwright discovery for the ${suite} suite exited with status ${status}.\n` +
          excerpt(`${stdout}\n${stderr}`)
      );
    }
    discovered[suite] = parseListedInventory(stdout, suite);
  }
  return discovered;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const discovered = await checkBrowserDiscovery();
    for (const [suite, { tests, files }] of Object.entries(discovered)) {
      console.log(`Playwright ${suite} discovery matches: ${tests} tests in ${files} files.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
