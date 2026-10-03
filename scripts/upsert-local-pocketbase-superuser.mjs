#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function buildSuperuserMigrationSource() {
  return `migrate(
  app => {
    const email = $os.getenv('LOCAL_POCKETBASE_ADMIN_EMAIL');
    const password = $os.getenv('LOCAL_POCKETBASE_ADMIN_PASSWORD');

    if (!email || !password) {
      throw new Error('LOCAL_POCKETBASE_ADMIN_EMAIL and LOCAL_POCKETBASE_ADMIN_PASSWORD must be set');
    }

    let record;
    try {
      record = app.findAuthRecordByEmail('_superusers', email);
    } catch {
      const collection = app.findCollectionByNameOrId('_superusers');
      record = new Record(collection);
    }

    record.set('email', email);
    record.set('password', password);
    app.save(record);
  },
  () => {}
);
`;
}

export function buildPocketBaseMigrateArgs(migrationsDir) {
  return ['migrate', 'up', '--migrationsDir', migrationsDir];
}

function formatSpawnFailure(result) {
  const stderr = typeof result?.stderr === 'string' ? result.stderr.trim() : '';
  const stdout = typeof result?.stdout === 'string' ? result.stdout.trim() : '';

  return [
    'Failed to create/update local PocketBase superuser.',
    stderr || stdout || `PocketBase exited with status ${result?.status ?? 'unknown'}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function upsertLocalPocketBaseSuperuser({
  pocketbaseBinary,
  localDir,
  email,
  password,
  env = process.env,
  spawnSyncFn = spawnSync,
  stdio = 'pipe',
}) {
  if (!email || !password) {
    throw new Error('LOCAL_POCKETBASE_ADMIN_EMAIL and LOCAL_POCKETBASE_ADMIN_PASSWORD must be set');
  }

  if (!existsSync(pocketbaseBinary)) {
    throw new Error(
      [
        'Missing local PocketBase binary.',
        `Expected: ${path.relative(process.cwd(), pocketbaseBinary)}`,
        'Download the matching PocketBase release and place the executable there.',
      ].join('\n')
    );
  }

  const migrationsDir = mkdtempSync(path.join(localDir, '.tmp-superuser-migrations-'));
  const migrationPath = path.join(
    migrationsDir,
    `${Date.now()}_${process.pid}_upsert_local_superuser.js`
  );

  try {
    writeFileSync(migrationPath, buildSuperuserMigrationSource(), { mode: 0o600 });

    const result = spawnSyncFn(pocketbaseBinary, buildPocketBaseMigrateArgs(migrationsDir), {
      cwd: localDir,
      env: {
        ...env,
        LOCAL_POCKETBASE_ADMIN_EMAIL: email,
        LOCAL_POCKETBASE_ADMIN_PASSWORD: password,
      },
      stdio,
      encoding: 'utf8',
    });

    if (result?.error) {
      throw result.error;
    }

    if (result?.status !== 0) {
      throw new Error(formatSpawnFailure(result));
    }
  } finally {
    rmSync(migrationsDir, { recursive: true, force: true });
  }
}

function main() {
  const rootDir = process.cwd();
  const localDir = path.join(rootDir, 'local-pb-db');
  const pocketbaseBinary = path.join(localDir, 'pocketbase');

  upsertLocalPocketBaseSuperuser({
    pocketbaseBinary,
    localDir,
    email: process.env.LOCAL_POCKETBASE_ADMIN_EMAIL,
    password: process.env.LOCAL_POCKETBASE_ADMIN_PASSWORD,
    stdio: 'inherit',
  });

  console.log('Created or updated local PocketBase superuser.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
