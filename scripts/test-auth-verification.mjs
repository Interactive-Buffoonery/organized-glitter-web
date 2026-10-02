import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import PocketBase from 'pocketbase';
import { installPocketBase, POCKETBASE_BASELINE_VERSION } from './install-pocketbase.mjs';

const root = process.cwd();
mkdirSync('.tmp', { recursive: true });
const directory = mkdtempSync(path.join(root, '.tmp/auth-verification-test-'));
const dataDir = path.join(directory, 'pb_data');
const migrationsDir = path.join(directory, 'migrations');
mkdirSync(migrationsDir, { recursive: true });

const option = name =>
  process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const targetBinary =
  option('binary') ??
  (await installPocketBase({
    destination: path.join(root, '.tmp/test-tools/pocketbase'),
  }));
let binary =
  option('baseline-binary') ??
  (await installPocketBase({
    version: POCKETBASE_BASELINE_VERSION,
    destination: path.join(root, `.tmp/pocketbase-cache/${POCKETBASE_BASELINE_VERSION}/pocketbase`),
  }));
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const adminEmail = 'auth-verification-admin@localhost.test';
const password = 'auth-verification-fixture-password';
const migrationName = readdirSync(path.join(root, 'pb_migrations')).find(fileName =>
  fileName.endsWith('_enforce_verified_auth.js')
);
assert.ok(migrationName, 'Missing verified-auth migration');

const setup = spawnSync(binary, ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`], {
  encoding: 'utf8',
});
assert.equal(setup.status, 0, setup.stderr);

let processHandle;
let processOutput = '';
const startPocketBase = async () => {
  processOutput = '';
  processHandle = spawn(
    binary,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${dataDir}`,
      `--hooksDir=${path.join(root, 'pb_hooks')}`,
      `--migrationsDir=${migrationsDir}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  processHandle.stdout.on('data', chunk => {
    processOutput += chunk.toString();
  });
  processHandle.stderr.on('data', chunk => {
    processOutput += chunk.toString();
  });

  const health = new PocketBase(url);
  for (let attempts = 0; ; attempts++) {
    if (processHandle.exitCode !== null) {
      throw new Error(`PocketBase exited during startup:\n${processOutput}`);
    }
    try {
      await health.health.check();
      return;
    } catch {
      if (attempts > 100) {
        throw new Error(`PocketBase did not start:\n${processOutput}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
};

const stopPocketBase = async () => {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode) return;

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (processHandle.exitCode === null && processHandle.signalCode === null) {
        processHandle.kill('SIGKILL');
      }
      resolve();
    }, 5_000);
    processHandle.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    processHandle.kill('SIGTERM');
  });
};

const exitAfterStop = signal => {
  void stopPocketBase().finally(() => {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => exitAfterStop(signal));
}
process.on('exit', () => {
  if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
    processHandle.kill('SIGKILL');
  }
});

const verifiedRequestRule = '@request.auth.verified = true';
const stripVerifiedRule = rule => {
  if (rule === verifiedRequestRule) return '';
  const prefix = `${verifiedRequestRule} && (`;
  if (typeof rule === 'string' && rule.startsWith(prefix) && rule.endsWith(')')) {
    return rule.slice(prefix.length, -1);
  }
  return rule;
};
const baselineSchema = JSON.parse(
  readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')
);
const productionIndexes = JSON.parse(
  readFileSync(path.join(root, 'scripts/fixtures/production-index-inventory.json'), 'utf8')
);
assert.deepEqual(
  Object.keys(productionIndexes).filter(
    name => !baselineSchema.some(collection => collection.name === name)
  ),
  [],
  'Every production collection must be represented in the upgrade fixture'
);
for (const collection of baselineSchema) {
  collection.indexes = productionIndexes[collection.name] ?? collection.indexes;
  if (collection.name === 'users') collection.authRule = '';
  for (const field of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
    collection[field] = stripVerifiedRule(collection[field]);
  }
}

let count = 0;
async function check(name, callback) {
  await callback();
  count++;
  console.log(`ok ${count} - ${name}`);
}

const admin = new PocketBase(url);
admin.autoCancellation(false);

try {
  await startPocketBase();
  await admin.collection('_superusers').authWithPassword(adminEmail, password);
  await admin.collections.import(baselineSchema, false);

  const unverified = await admin.collection('users').create({
    email: 'unverified@localhost.test',
    username: 'unverified-user',
    password,
    passwordConfirm: password,
    verified: false,
  });
  const verified = await admin.collection('users').create({
    email: 'verified@localhost.test',
    username: 'verified-user',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const legacyOAuth = await admin.collection('users').create({
    email: 'oauth@localhost.test',
    username: 'oauth-user',
    password,
    passwordConfirm: password,
    verified: false,
  });
  await admin.collection('_externalAuths').create({
    collectionRef: '_pb_users_auth_',
    recordRef: legacyOAuth.id,
    provider: 'discord',
    providerId: 'legacy-discord-account',
  });

  const preMigration = new PocketBase(url);
  preMigration.autoCancellation(false);
  await preMigration.collection('users').authWithPassword(unverified.email, password);
  const preMigrationToken = preMigration.authStore.token;

  await check('the previous collection policy allowed an unverified password token', async () => {
    await preMigration.collection('companies').create({
      name: 'Pre-migration company',
      user: unverified.id,
    });
  });

  await stopPocketBase();
  const snapshotIndexes = () => {
    const database = new DatabaseSync(path.join(dataDir, 'data.db'), { readOnly: true });
    try {
      return {
        physical: database
          .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'index' ORDER BY name")
          .all(),
        metadata: database.prepare('SELECT name, indexes FROM _collections ORDER BY name').all(),
      };
    } finally {
      database.close();
    }
  };
  await startPocketBase();
  await stopPocketBase();
  const beforeIndexes = snapshotIndexes();
  const failures = [];
  for (const compatibilityMigration of [
    '1789940323_normalize_legacy_index_metadata.js',
    '1789940323_repair_production_book_indexes.js',
    '1789940323_repair_production_page_indexes.js',
  ]) {
    try {
      copyFileSync(
        path.join(root, 'pb_migrations', compatibilityMigration),
        path.join(migrationsDir, compatibilityMigration)
      );
    } catch (error) {
      failures.push({ migration: compatibilityMigration, error });
    }
  }
  assert.deepEqual(failures, []);
  binary = targetBinary;
  copyFileSync(
    path.join(root, 'pb_migrations', migrationName),
    path.join(migrationsDir, migrationName)
  );
  await startPocketBase();
  await check('legacy index metadata normalization preserves physical indexes', async () => {
    const afterIndexes = snapshotIndexes();
    assert.deepEqual(afterIndexes.physical, beforeIndexes.physical);
    for (const before of beforeIndexes.metadata) {
      const after = afterIndexes.metadata.find(item => item.name === before.name);
      assert.ok(after);
      assert.deepEqual(
        JSON.parse(after.indexes),
        JSON.parse(before.indexes).map(index => index.replace(/;\s*$/, ''))
      );
    }
  });
  admin.authStore.clear();
  await admin.collection('_superusers').authWithPassword(adminEmail, password);

  await check('the migration preserves existing OAuth-only account access', async () => {
    const migrated = await admin.collection('users').getOne(legacyOAuth.id);
    assert.equal(migrated.verified, true);
  });

  await check('the auth-rule change invalidates pre-existing unverified tokens', async () => {
    const stale = new PocketBase(url);
    stale.authStore.save(preMigrationToken, unverified);
    // Rotating users.authToken.secret invalidates the JWT. Collection create
    // then evaluates the guest create rule and returns 400; custom routes that
    // call RequireAuth return 401.
    await assert.rejects(
      stale.collection('companies').create({ name: 'Stale token company', user: unverified.id }),
      error => {
        assert.equal(error.status, 400);
        return true;
      }
    );
    await assert.rejects(
      stale.send('/api/stats/summary', { method: 'GET' }),
      error => {
        assert.equal(error.status, 401);
        return true;
      }
    );
  });

  await check('unverified password authentication is rejected by PocketBase', async () => {
    const client = new PocketBase(url);
    await assert.rejects(
      client.collection('users').authWithPassword(unverified.email, password),
      error => {
        assert.equal(error.status, 403);
        assert.equal(
          error.message,
          "The request doesn't satisfy the collection requirements to authenticate."
        );
        return true;
      }
    );
  });

  await check('verified password users retain collection and custom-route access', async () => {
    const client = new PocketBase(url);
    await client.collection('users').authWithPassword(verified.email, password);
    await client.collection('companies').create({
      name: 'Verified company',
      user: verified.id,
    });
    await client.send('/api/stats/summary', { method: 'GET' });
  });

  await check(
    'business rules and custom routes reject an unverified authenticated user',
    async () => {
      const usersCollection = await admin.collections.getOne('users');
      await admin.collections.update(usersCollection.id, { authRule: '' });

      const client = new PocketBase(url);
      await client.collection('users').authWithPassword(unverified.email, password);
      await assert.rejects(
        client.collection('companies').create({
          name: 'Rule bypass company',
          user: unverified.id,
        }),
        error => error.status === 400
      );
      await assert.rejects(
        client.send('/api/stats/summary', { method: 'GET' }),
        error => error.status === 403
      );
    }
  );

  console.log(`Passed ${count} disposable PocketBase auth-verification checks.`);
} finally {
  await stopPocketBase();
}
