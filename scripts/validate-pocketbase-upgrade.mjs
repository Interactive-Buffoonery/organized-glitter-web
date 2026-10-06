#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  installPocketBase,
  POCKETBASE_BASELINE_VERSION,
  POCKETBASE_VERSION,
} from './install-pocketbase.mjs';
import { upsertLocalPocketBaseSuperuser } from './upsert-local-pocketbase-superuser.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = 'docs/pocketbase/collections.schema.json';
const indexInventoryPath = 'scripts/fixtures/production-index-inventory.json';
const runRoot = path.join(rootDir, '.tmp', 'pocketbase-upgrade');
const adminEmail = 'upgrade-admin@localhost.test';
const adminPassword = 'upgrade-test-password-123';
const sentinelUserId = 'upgradeuser0001';

const getArgValue = (argv, name) => {
  const argument = argv.find(value => value.startsWith(`${name}=`));
  return argument?.slice(name.length + 1);
};

export function resolveBaseRef(argv, env = process.env) {
  const baseRef =
    getArgValue(argv, '--base-ref') ||
    env.CI_BASE_SHA ||
    env.GITHUB_BASE_SHA ||
    env.GITHUB_EVENT_BEFORE ||
    'origin/main';
  if (!baseRef || /^0+$/.test(baseRef)) {
    throw new Error(
      'PocketBase upgrade validation needs a real base commit; the push before SHA is missing.'
    );
  }
  return baseRef;
}

const git = args => {
  const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.stdout;
};

export function isBootstrapBaseline(baseCommit, gitFn = git) {
  return (
    !gitFn(['ls-tree', '--name-only', baseCommit]).trim() &&
    !gitFn(['show', '-s', '--format=%P', baseCommit]).trim()
  );
}

export function parseChangedPaths(output) {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, firstPath, secondPath] = line.split('\t');
      return { path: secondPath || firstPath, previousPath: secondPath ? firstPath : null, status };
    });
}

export function collectUpgradeChanges({ baseCommit, gitFn = git }) {
  const tracked = parseChangedPaths(
    gitFn(['diff', '--name-status', baseCommit, '--', schemaPath, 'pb_migrations'])
  );
  const untrackedMigrations = gitFn([
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    'pb_migrations/*.js',
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  const knownPaths = new Set(tracked.flatMap(change => [change.path, change.previousPath]));

  return [
    ...tracked,
    ...untrackedMigrations
      .filter(filePath => !knownPaths.has(filePath))
      .map(filePath => ({ path: filePath, previousPath: null, status: 'A' })),
  ];
}

export function classifyUpgradeChanges(changes) {
  const migrationChanges = changes.filter(
    change =>
      change.path.startsWith('pb_migrations/') || change.previousPath?.startsWith('pb_migrations/')
  );
  const unsafeMigrationChanges = migrationChanges.filter(change => change.status !== 'A');
  if (unsafeMigrationChanges.length > 0) {
    throw new Error(
      [
        'Previously deployable PocketBase migrations must remain immutable.',
        ...unsafeMigrationChanges.map(change => `${change.status}\t${change.path}`),
        'Add a new forward migration instead of modifying, renaming, or deleting an existing file.',
      ].join('\n')
    );
  }

  return {
    addedMigrations: migrationChanges.map(change => change.path).sort(),
    schemaTouched: changes.some(
      change => change.path === schemaPath || change.previousPath === schemaPath
    ),
  };
}

const sortObjectKeys = value => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortObjectKeys(value[key])])
  );
};

const withoutVolatileSchemaFields = schema =>
  schema
    .map(collection => {
      const { created: _created, updated: _updated, ...stable } = collection;
      return sortObjectKeys(stable);
    })
    .sort((left, right) => left.id.localeCompare(right.id));

export function schemasHaveSameContract(leftSource, rightSource) {
  const left = withoutVolatileSchemaFields(JSON.parse(leftSource));
  const right = withoutVolatileSchemaFields(JSON.parse(rightSource));
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertUpgradeChangeContract({ addedMigrations, schemaContractChanged }) {
  if (schemaContractChanged && addedMigrations.length === 0) {
    throw new Error('PocketBase schema contract changed without a new deployable migration.');
  }
}

const stripIndexTerminator = index => index.replace(/;\s*$/, '');

export function applyIndexInventory(schema, inventory = {}) {
  return schema.map(collection => {
    const indexes = inventory[collection.name] ?? collection.indexes ?? [];
    return {
      ...collection,
      indexes: indexes.map(stripIndexTerminator),
    };
  });
}

export function resolveUpgradeRunDir(runId, baseDir = runRoot) {
  if (path.isAbsolute(runId)) {
    throw new Error(`Upgrade run id must stay inside ${path.relative(rootDir, baseDir)}.`);
  }
  const safeRunId = runId.replace(/[^A-Za-z0-9._-]/g, '-');
  const runDir = path.resolve(baseDir, safeRunId);
  const relative = path.relative(baseDir, runDir);
  if (!safeRunId || relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Upgrade run id must stay inside ${path.relative(rootDir, baseDir)}.`);
  }
  if (existsSync(runDir)) throw new Error(`PocketBase upgrade run directory exists: ${runDir}`);
  return runDir;
}

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a loopback port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });

const waitForHttp = async (url, processHandle, label) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (processHandle.exitCode !== null) {
      throw new Error(`${label} exited before startup with status ${processHandle.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until timeout so startup logs remain the primary failure evidence.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not become ready at ${url}.`);
};

const stopProcess = processHandle =>
  new Promise(resolve => {
    if (!processHandle || processHandle.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, 5_000);
    processHandle.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    processHandle.kill('SIGTERM');
  });

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}: ${body}`);
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
};

const startPocketBase = async ({ binary, dataDir, logPrefix }) => {
  const port = await getFreePort();
  const stdout = openSync(`${logPrefix}.stdout.log`, 'a');
  const stderr = openSync(`${logPrefix}.stderr.log`, 'a');
  const processHandle = spawn(
    binary,
    ['serve', `--http=127.0.0.1:${port}`, `--dir=${path.join(dataDir, 'pb_data')}`],
    { cwd: dataDir, stdio: ['ignore', stdout, stderr] }
  );
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(`${url}/api/health`, processHandle, path.basename(logPrefix));
  return { processHandle, stderr, stdout, url };
};

const authenticateSuperuser = async url => {
  const result = await requestJson(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  return result.token;
};

const importSchema = async (url, token, schema) => {
  await requestJson(`${url}/api/collections/import`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: schema, deleteMissing: true }),
  });
};

const seedUpgradeSentinel = (url, token) =>
  requestJson(`${url}/api/collections/users/records`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'upgrade-sentinel@example.test',
      id: sentinelUserId,
      password: 'upgrade-sentinel-password-123',
      passwordConfirm: 'upgrade-sentinel-password-123',
      username: 'upgrade-sentinel',
      verified: true,
    }),
  });

const assertUpgradeSentinel = async (url, token) => {
  const sentinel = await requestJson(`${url}/api/collections/users/records/${sentinelUserId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (sentinel.email !== 'upgrade-sentinel@example.test') {
    throw new Error('PocketBase migration did not preserve the prior-schema sentinel user.');
  }
};

const readCanonicalCollections = async (url, token) => {
  const result = await requestJson(`${url}/api/collections?perPage=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return withoutVolatileSchemaFields(result.items);
};

const prepareDataDir = async ({
  sourceBinary,
  dataDir,
  schema,
  logPrefix,
  seedSentinel = false,
}) => {
  mkdirSync(dataDir, { recursive: true });
  const binary = path.join(dataDir, 'pocketbase');
  copyFileSync(sourceBinary, binary);
  chmodSync(binary, 0o755);
  upsertLocalPocketBaseSuperuser({
    pocketbaseBinary: binary,
    localDir: dataDir,
    email: adminEmail,
    password: adminPassword,
  });
  const server = await startPocketBase({ binary, dataDir, logPrefix });
  try {
    const token = await authenticateSuperuser(server.url);
    await importSchema(server.url, token, schema);
    if (seedSentinel) await seedUpgradeSentinel(server.url, token);
  } finally {
    await stopProcess(server.processHandle);
    closeSync(server.stdout);
    closeSync(server.stderr);
  }
  return binary;
};

const inspectDataDir = async ({ binary, dataDir, logPrefix, expectSentinel = false }) => {
  const server = await startPocketBase({ binary, dataDir, logPrefix });
  try {
    const token = await authenticateSuperuser(server.url);
    if (expectSentinel) await assertUpgradeSentinel(server.url, token);
    return await readCanonicalCollections(server.url, token);
  } finally {
    await stopProcess(server.processHandle);
    closeSync(server.stdout);
    closeSync(server.stderr);
  }
};

export async function validatePocketBaseUpgrade(argv = process.argv.slice(2)) {
  const baseRef = resolveBaseRef(argv);
  const baseCommit = git(['rev-parse', '--verify', `${baseRef}^{commit}`]).trim();
  const changes = collectUpgradeChanges({ baseCommit });
  const { addedMigrations } = classifyUpgradeChanges(changes);
  if (isBootstrapBaseline(baseCommit)) {
    console.log(
      'Empty public root has no prior deployed schema. Fresh installation and protected-file baseline checks are required separately.'
    );
    return { addedMigrations, skipped: true, bootstrap: true };
  }
  const baseSchemaSource = git(['show', `${baseCommit}:${schemaPath}`]);
  const headSchemaSource = readFileSync(path.join(rootDir, schemaPath), 'utf8');
  const schemaContractChanged = !schemasHaveSameContract(baseSchemaSource, headSchemaSource);

  assertUpgradeChangeContract({ addedMigrations, schemaContractChanged });
  if (addedMigrations.length === 0) {
    console.log(
      `PocketBase upgrade validation: no contract or migration changes since ${baseCommit}.`
    );
    return { addedMigrations, skipped: true };
  }

  const runId = getArgValue(argv, '--run-id') || `upgrade-${Date.now()}`;
  const runDir = resolveUpgradeRunDir(runId);
  const logsDir = path.join(runDir, 'logs');
  const migrationDir = path.join(runDir, 'migrations');
  const upgradedDataDir = path.join(runDir, 'upgraded');
  const expectedDataDir = path.join(runDir, 'expected');
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(migrationDir, { recursive: true });

  const cachedCurrentBinary = await installPocketBase({
    destination: path.join(rootDir, '.tmp', 'pocketbase-cache', POCKETBASE_VERSION, 'pocketbase'),
  });
  const cachedBaselineBinary = await installPocketBase({
    version: POCKETBASE_BASELINE_VERSION,
    destination: path.join(
      rootDir,
      '.tmp',
      'pocketbase-cache',
      POCKETBASE_BASELINE_VERSION,
      'pocketbase'
    ),
  });

  for (const migration of addedMigrations) {
    if (!existsSync(path.join(rootDir, migration))) {
      throw new Error(`Added migration is missing from the worktree: ${migration}`);
    }
    copyFileSync(path.join(rootDir, migration), path.join(migrationDir, path.basename(migration)));
  }

  const inventory = existsSync(path.join(rootDir, indexInventoryPath))
    ? JSON.parse(readFileSync(path.join(rootDir, indexInventoryPath), 'utf8'))
    : {};
  // PocketBase 0.40.4 rejects legacy `;\n` index metadata on import. Seed the
  // previous schema with the 0.40.1 baseline after applying the production
  // index inventory (semicolon-stripped) so the upgrade matches deployed
  // metadata without asking 0.40.4 to ingest invalid CREATE INDEX strings.
  const previousSchema = applyIndexInventory(JSON.parse(baseSchemaSource), inventory);

  const upgradedBinary = await prepareDataDir({
    sourceBinary: cachedBaselineBinary,
    dataDir: upgradedDataDir,
    schema: previousSchema,
    logPrefix: path.join(logsDir, 'base-import'),
    seedSentinel: true,
  });
  copyFileSync(cachedCurrentBinary, upgradedBinary);
  chmodSync(upgradedBinary, 0o755);

  const migrationResult = spawnSync(
    upgradedBinary,
    [
      'migrate',
      'up',
      '--dir',
      path.join(upgradedDataDir, 'pb_data'),
      '--migrationsDir',
      migrationDir,
    ],
    { cwd: upgradedDataDir, encoding: 'utf8' }
  );
  writeFileSync(
    path.join(logsDir, 'migrate-up.log'),
    `${migrationResult.stdout || ''}\n${migrationResult.stderr || ''}`
  );
  if (migrationResult.error) throw migrationResult.error;
  if (migrationResult.status !== 0) {
    throw new Error(
      `PocketBase migration upgrade failed with status ${migrationResult.status}. See ${path.join(logsDir, 'migrate-up.log')}.`
    );
  }

  const expectedBinary = await prepareDataDir({
    sourceBinary: cachedCurrentBinary,
    dataDir: expectedDataDir,
    schema: JSON.parse(headSchemaSource),
    logPrefix: path.join(logsDir, 'head-import'),
  });

  const [upgraded, expected] = await Promise.all([
    inspectDataDir({
      binary: upgradedBinary,
      dataDir: upgradedDataDir,
      expectSentinel: true,
      logPrefix: path.join(logsDir, 'upgraded-inspect'),
    }),
    inspectDataDir({
      binary: expectedBinary,
      dataDir: expectedDataDir,
      logPrefix: path.join(logsDir, 'expected-inspect'),
    }),
  ]);

  if (JSON.stringify(upgraded) !== JSON.stringify(expected)) {
    const diffPath = path.join(runDir, 'schema-comparison.json');
    writeFileSync(diffPath, `${JSON.stringify({ upgraded, expected }, null, 2)}\n`);
    throw new Error(`Upgraded schema does not match the HEAD contract. See ${diffPath}.`);
  }

  console.log(
    `Validated ${addedMigrations.length} PocketBase migration(s) from ${baseCommit}; logs: ${logsDir}`
  );
  return { addedMigrations, logsDir, skipped: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validatePocketBaseUpgrade().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
