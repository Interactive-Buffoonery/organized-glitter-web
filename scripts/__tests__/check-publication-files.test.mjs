import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { isPrivateRuntimePath } from '../check-publication-files.mjs';

describe('public repository files', () => {
  it.each([
    'pb_data/data.db',
    'local-pb-db/storage/upload.png',
    'backups/snapshot.zip',
    'nested/pb_data/settings.json',
    'e2e/.auth/user.json',
    '.env',
    '.env.production',
    'config/site.env',
    'keys/apple.p8',
    'private/apple-auth-private/config.json',
    'renamed.sqlite-wal',
    'nested/DATA.DB',
  ])('rejects runtime path %s', path => {
    expect(isPrivateRuntimePath(path)).toBe(true);
  });

  it.each([
    '.env.example',
    'config/official-site.env.example',
    'docs/pocketbase/collections.schema.json',
    'pb_migrations/123_schema.js',
    'pb_hooks/auth.pb.js',
    'docs/pocketbase/audits/ownership.sql',
  ])('allows public source %s', path => {
    expect(isPrivateRuntimePath(path)).toBe(false);
  });

  it.each(['data.db', '.env', 'pb_data/record.txt'])(
    'rejects private path %s after its file was deleted',
    path => {
      const directory = mkdtempSync(join(tmpdir(), 'og-publication-path-fixture-'));
      const git = (...args) => execFileSync('git', args, { cwd: directory });
      git('init', '-q');
      git('config', 'user.email', 'test@example.test');
      git('config', 'user.name', 'Test');
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), 'synthetic fixture');
      git('add', path);
      git('commit', '-qm', 'add fixture');
      git('rm', path);
      git('commit', '-qm', 'delete fixture');
      const result = spawnSync(
        process.execPath,
        ['scripts/check-publication-files.mjs', directory],
        {
          encoding: 'utf8',
        }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Private runtime files');
    }
  );

  it('rejects a renamed SQLite blob after its file was deleted', () => {
    const directory = mkdtempSync(join(tmpdir(), 'og-publication-fixture-'));
    const git = (...args) => execFileSync('git', args, { cwd: directory });
    git('init', '-q');
    git('config', 'user.email', 'test@example.test');
    git('config', 'user.name', 'Test');
    writeFileSync(join(directory, 'fixture.txt'), 'SQLite format 3\0synthetic fixture');
    git('add', 'fixture.txt');
    git('commit', '-qm', 'add fixture');
    git('rm', 'fixture.txt');
    git('commit', '-qm', 'delete fixture');
    const result = spawnSync(process.execPath, ['scripts/check-publication-files.mjs', directory], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SQLite database');
    expect(result.stderr).not.toContain('synthetic fixture');
  });
});
