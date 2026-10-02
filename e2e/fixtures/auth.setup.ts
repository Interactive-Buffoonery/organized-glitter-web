/**
 * Auth setup: log in once per test run, persist storage state, reuse in all
 * downstream tests via `storageState`.
 *
 * This file is registered as a Playwright "setup" project in
 * playwright.config.ts. Other test projects depend on it, so it always runs
 * first and the storage state it writes is ready by the time route-mount
 * tests start.
 *
 * Why real UI login rather than injecting a cookie:
 * We want to know that the app's own login flow works end-to-end every run.
 * Injecting PocketBase auth tokens directly would skip the /login page,
 * which is itself one of the routes we care about not regressing.
 *
 * Credential source: environment variables in CI, or `.env.e2e.local` /
 * `.env.e2e` at repo root for local runs. Format:
 *     E2E_TEST_EMAIL=...
 *     E2E_TEST_PASSWORD=...
 * Not checked into git.
 */

import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { parseEnv } from 'node:util';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const envFile = path.join(rootDir, '.env.e2e');
const localEnvFile = path.join(rootDir, '.env.e2e.local');

const readEnvFile = (filePath: string) =>
  fs.existsSync(filePath) ? parseEnv(fs.readFileSync(filePath, 'utf8')) : {};

export const STORAGE_STATE = process.env.E2E_STORAGE_STATE
  ? path.resolve(rootDir, process.env.E2E_STORAGE_STATE)
  : path.join(rootDir, 'e2e', '.auth', 'user.json');

setup('authenticate via real login form', async ({ page }) => {
  const parsed = {
    ...readEnvFile(envFile),
    ...readEnvFile(localEnvFile),
  };
  const email = process.env.E2E_TEST_EMAIL ?? parsed.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD ?? parsed.E2E_TEST_PASSWORD;

  if (!email || !password) {
    if (!fs.existsSync(envFile) && !fs.existsSync(localEnvFile)) {
      throw new Error(
        `Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD. Export them in the ` +
          `environment or create ${localEnvFile} / ${envFile} for local runs.`
      );
    }

    throw new Error(
      `process.env, .env.e2e.local, or .env.e2e is missing ` +
        `E2E_TEST_EMAIL or E2E_TEST_PASSWORD. Current E2E env keys: ` +
        `${Object.keys(parsed).join(', ')}.`
    );
  }

  await page.goto('/login');

  // The login page exposes role=textbox for Email / Password with visible
  // labels. Using getByLabel keeps this resilient to input-type changes.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Successful login redirects to /overview. That's the documented default
  // destination (see DEFAULT_AUTH_REDIRECT in src/utils/auth/redirects.ts).
  // A user coming from a protected route would instead be redirected back
  // to wherever they were, via the `state.from` mechanism — but from a
  // cold /login visit the contract is /overview.
  await page.waitForURL(/\/overview(\?|$)/, { timeout: 15_000 });

  // Confirm Overview actually rendered (not just that the URL changed).
  // The Overview welcome heading starts with "Welcome back, " followed by
  // the username — partial-match so the specific E2E username doesn't matter.
  await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
