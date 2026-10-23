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
  it.each(['https://backend.example.test', 'http://local-user:local-secret@localhost:8090'])(
    'refuses a nonlocal or unsafe backend before starting Playwright: %s',
    url => {
      const result = runLocalSuite({ VITE_POCKETBASE_URL: url });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('VITE_POCKETBASE_URL');
      expect(result.stdout).not.toContain('playwright-stub-started');
      expect(result.stderr).not.toContain('local-secret');
    }
  );

  it('refuses a remote app override before starting Playwright', () => {
    const result = runLocalSuite({ E2E_APP_URL: 'https://app.example.test' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('E2E_APP_URL');
    expect(result.stdout).not.toContain('playwright-stub-started');
  });
});
