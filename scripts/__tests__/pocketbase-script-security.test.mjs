import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json' with { type: 'json' };
import {
  buildSuperuserMigrationSource,
  upsertLocalPocketBaseSuperuser,
} from '../upsert-local-pocketbase-superuser.mjs';

describe('PocketBase package scripts', () => {
  it('do not pass secret env values through command arguments', () => {
    const secretArgPatterns = [
      /--(?:password|token|secret)(?:=|\s+)["']?\$[A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET)\b/i,
      /\bsuperuser\s+(?:create|update|upsert)\b[^\n]*\$[A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET)\b/i,
    ];

    for (const [scriptName, command] of Object.entries(packageJson.scripts)) {
      for (const pattern of secretArgPatterns) {
        expect(command, `${scriptName} must not expose secrets in argv`).not.toMatch(pattern);
      }
    }
  });
});

describe('local PocketBase superuser wrapper', () => {
  it('passes the password through env instead of migrate argv', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'og-pb-security-'));
    const localDir = path.join(rootDir, 'local-pb-db');
    const pocketbaseBinary = path.join(localDir, 'pocketbase');
    const password = 'local-secret-password';
    let capturedArgs = [];
    let capturedEnv = {};

    mkdirSync(localDir, { recursive: true });
    writeFileSync(pocketbaseBinary, '');

    try {
      upsertLocalPocketBaseSuperuser({
        pocketbaseBinary,
        localDir,
        email: 'admin@localhost.dev',
        password,
        env: {},
        spawnSyncFn: (_command, args, options) => {
          capturedArgs = args;
          capturedEnv = options.env;
          return { status: 0, stdout: '', stderr: '' };
        },
      });

      expect(capturedArgs.join(' ')).not.toContain(password);
      expect(capturedEnv.LOCAL_POCKETBASE_ADMIN_PASSWORD).toBe(password);
      expect(buildSuperuserMigrationSource()).not.toContain(password);
    } finally {
      if (existsSync(rootDir)) {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });
});
