import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function testAccountDeletionMigration(binary, runDir) {
  const directory = path.join(runDir, 'account-deletion-upgrade');
  const migrations = path.join(directory, 'migrations');
  mkdirSync(migrations, { recursive: true });
  const schema = JSON.parse(readFileSync('docs/pocketbase/collections.schema.json', 'utf8'));
  const audits = schema.find(c => c.name === 'account_deletions');
  audits.indexes = audits.indexes.filter(index => !index.includes('idx_account_deletions_created'));
  // Reconstruct the shipped jobs collection from its immutable migration.
  const oldMigration = readFileSync('pb_migrations/1791129600_account_deletion.js', 'utf8');
  writeFileSync(
    path.join(migrations, '1791129599_setup.js'),
    `migrate(app => {
    app.importCollections(${JSON.stringify(schema.filter(c => c.name !== 'account_deletion_jobs'))}, false);
  }, () => {});`
  );
  writeFileSync(path.join(migrations, '1791129600_account_deletion.js'), oldMigration);
  writeFileSync(
    path.join(migrations, '1791129601_seed.js'),
    `migrate(app => {
    for (const [id, status] of [['pendinguser0001', 'pending'], ['completeuser001', 'completed']]) {
      const job = new Record(app.findCollectionByNameOrId('account_deletion_jobs'));
      job.set('user_id', id);
      job.set('proof_hash', $security.sha256(id));
      job.set('posthog_status', status);
      job.set('revenuecat_status', 'pending');
      app.save(job);
    }
  }, () => {});`
  );
  const run = () => {
    const result = spawnSync(
      binary,
      ['migrate', 'up', `--dir=${directory}/data`, `--migrationsDir=${migrations}`],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  run();
  copyFileSync(
    'pb_migrations/1792281600_account_deletion_worker.js',
    path.join(migrations, '1792281600_account_deletion_worker.js')
  );
  run();
  const db = new DatabaseSync(path.join(directory, 'data/data.db'));
  try {
    assert.equal(
      db
        .prepare('PRAGMA table_info(account_deletion_jobs)')
        .all()
        .some(c => c.name === 'revenuecat_status'),
      false
    );
    const jobs = db.prepare('SELECT * FROM account_deletion_jobs ORDER BY user_id').all();
    assert.equal(jobs.length, 2, 'upgrade preserves receipts');
    for (const job of jobs) {
      assert.equal(job.source_kind, 'guarded');
      assert.ok(
        Number.isFinite(Date.parse(job.next_alert)),
        'upgraded jobs have independent alert scheduling'
      );
      assert.equal(job.proof_hash.length, 64);
      assert.equal(job.posthog_status, 'pending', 'unverified historical completion is rechecked');
    }
  } finally {
    db.close();
  }
}
