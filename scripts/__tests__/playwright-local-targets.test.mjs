import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const binDir = mkdtempSync(path.join(tmpdir(), 'og-local-playwright-'));
const pnpmStub = path.join(binDir, 'pnpm');
writeFileSync(pnpmStub, '#!/bin/sh\necho playwright-stub-started\n');
chmodSync(pnpmStub, 0o755);

function runLocalSuite(overrides) {
  return spawnSync(process.execPath, ['scripts/run-playwright-a11y-local.mjs'], {
    encoding: 'utf8',
    env: {
      PATH: binDir,
      VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
      E2E_APP_URL: 'http://localhost:3000',
      E2E_TEST_EMAIL: 'local@example.test',
      E2E_TEST_PASSWORD: 'local-test-password',
      ...overrides,
    },
  });
}

describe('local accessibility target safety', () => {
  it.each([
    'https://backend.example.test',
    'http://localhost.example.test:8090',
    'file:///tmp/pocketbase',
    'not-a-url',
    'http://local-user:local-secret@localhost:8090',
  ])('refuses a nonlocal or unsafe backend before starting Playwright: %s', url => {
    const result = runLocalSuite({ VITE_POCKETBASE_URL: url });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_POCKETBASE_URL');
    expect(result.stdout).not.toContain('playwright-stub-started');
    expect(result.stderr).not.toContain('local-secret');
  });

  it('refuses a remote app override before starting Playwright', () => {
    const result = runLocalSuite({ E2E_APP_URL: 'https://app.example.test' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('E2E_APP_URL');
    expect(result.stdout).not.toContain('playwright-stub-started');
  });

  it.each(['http://localhost:8090', 'http://127.0.0.1:8090', 'http://[::1]:8090'])(
    'runs both suites with a loopback backend: %s',
    url => {
      const result = runLocalSuite({ VITE_POCKETBASE_URL: url });
      expect(result.status).toBe(0);
      expect(result.stdout.match(/playwright-stub-started/g)).toHaveLength(2);
    }
  );
});

describe('local accessibility server isolation', () => {
  it('starts a fresh server when the accessibility runner sets test mode', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import config from './playwright.config.ts'; console.log(JSON.stringify({ reuse: config.webServer.reuseExistingServer, mode: config.webServer.env.APP_TEST_ENV }));",
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CI: '', APP_TEST_ENV: 'test' },
      }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ reuse: false, mode: 'test' });
  });
});

describe('disposable QA harness Playwright config', () => {
  it('uses the harness server and per-run auth state for the complete inventory', () => {
    const storageState = '/tmp/og-disposable-qa/auth/user.json';
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import config from './playwright.config.ts'; console.log(JSON.stringify({ webServer: Boolean(config.webServer), storageState: config.projects.find(project => project.name === 'authenticated').use.storageState, projects: config.projects.map(project => project.name) }));",
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          APP_TEST_ENV: 'test',
          E2E_QA_SUITE: 'legacy',
          E2E_STORAGE_STATE: storageState,
        },
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      webServer: false,
      storageState,
      projects: [
        'setup',
        'public',
        'authenticated',
        'screen-review-desktop',
        'screen-review-mobile-chrome',
        'screen-review-mobile-safari',
      ],
    });
  });
});
