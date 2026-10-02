import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function testAppleGrantMigration(binary, root, runDir) {
  for (const enabled of [false, true]) {
    const directory = path.join(runDir, `migration-${enabled}`);
    const migrations = path.join(directory, 'migrations');
    mkdirSync(migrations, { recursive: true });
    const run = args => {
      const result = spawnSync(binary, [...args, `--dir=${path.join(directory, 'data')}`, `--migrationsDir=${migrations}`], {
        input: 'y\n', encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    writeFileSync(path.join(migrations, '1790495999_setup.js'), `migrate(app => {
      const settings = app.settings();
      settings.rateLimits.enabled = ${enabled};
      app.save(settings);
    }, () => {});`);
    const migration = path.join(migrations, '1790496000_apple_grants.js');
    copyFileSync(path.join(root, 'pb_migrations/1790496000_apple_grants.js'), migration);
    const verification = path.join(migrations, '1790496001_verify.js');
    writeFileSync(verification, `migrate(app => {
      const limits = app.settings().rateLimits;
      if (limits.enabled !== ${enabled}) throw new Error('Apple migration changed global rate limiting');
      for (const label of ['POST /api/auth/apple/native', 'GET /api/auth/apple/native/readiness']) {
        if (!limits.rules.some(rule => rule.label === label)) throw new Error('Missing Apple rate rule');
      }
    }, () => {});`);
    run(['migrate', 'up']);
    run(['migrate', 'down', '2']);
    renameSync(migration, `${migration}.disabled`);
    writeFileSync(verification, `migrate(app => {
      const limits = app.settings().rateLimits;
      if (limits.enabled !== ${enabled}) throw new Error('Apple rollback changed global rate limiting');
      if (limits.rules.some(rule => rule.label.includes('/api/auth/apple/native'))) {
        throw new Error('Apple rollback retained route rules');
      }
    }, () => {});`);
    run(['migrate', 'up']);
  }
}
