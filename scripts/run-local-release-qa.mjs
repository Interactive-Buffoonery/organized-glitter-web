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
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { installPocketBase, POCKETBASE_VERSION } from './install-pocketbase.mjs';
import { upsertLocalPocketBaseSuperuser } from './upsert-local-pocketbase-superuser.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runRoot = path.join(rootDir, '.tmp', 'pocketbase-release-qa');
export const pocketBaseCachePath = path.join(
  rootDir,
  '.tmp',
  'pocketbase-cache',
  POCKETBASE_VERSION,
  'pocketbase'
);
const defaultTestEmail = 'sarah-local@example.test';
const defaultTestPassword = 'local-test-password-123';
const adminEmail = 'admin@localhost.test';
const adminPassword = 'admin-local-release-qa-123';
const randomizerFixtureCount = 8;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const qaEnvironment = env => ({
  ...env,
  POSTHOG_CLI_TOKEN: '',
  POSTHOG_CLI_API_KEY: '',
  RESEND_API_KEY: '',
});

export const assertPortAvailable = port =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(new Error(`QA port ${port} is already in use or unavailable.`))
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });

export const isLocalUrl = value => {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

const assertLocalUrl = (value, name) => {
  if (!isLocalUrl(value)) {
    throw new Error(`${name} must be localhost or 127.0.0.1. Received: ${value}`);
  }
};

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a localhost port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });

export async function waitForHttp(
  url,
  label,
  { processHandle, timeoutMs = 30_000, fetchFn = fetch } = {}
) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (processHandle && (processHandle.exitCode !== null || processHandle.signalCode)) {
      throw new Error(
        `${label} exited before becoming ready with status ${processHandle.exitCode}.`
      );
    }

    try {
      const response = await fetchFn(url, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(1000, timeoutMs - (Date.now() - startedAt)))
        ),
      });
      if (response.ok) return;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || 'timeout'}`);
}

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}: ${body}`);
  }
  return response.json();
};

const authenticate = ({ pbUrl, email, password }) =>
  requestJson(`${pbUrl}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });

const getFixture = async ({ pbUrl, token, collection, id }) => {
  const response = await fetch(`${pbUrl}/api/collections/${collection}/records/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Fixture lookup for ${collection}/${id} failed with HTTP ${response.status}.`);
  }
  return response.json();
};

export function parseRandomizerFixtureIds(output) {
  const match = output.match(/^E2E_RANDOMIZER_PROJECT_IDS=([^\r\n]+)$/m);
  if (!match) throw new Error('Randomizer fixture seed did not report project ids.');
  const ids = match[1]
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  if (
    ids.length !== randomizerFixtureCount ||
    new Set(ids).size !== randomizerFixtureCount ||
    ids.some(id => !/^[A-Za-z0-9]{15}$/.test(id))
  ) {
    throw new Error(
      `Randomizer fixture seed expected ${randomizerFixtureCount} unique project ids.`
    );
  }
  return ids;
}

export async function resolveQaFixtures({ pbUrl, email, password, randomizerProjectIds = [] }) {
  const auth = await authenticate({ pbUrl, email, password });
  const required = [
    ['projects', 'localproject003'],
    ['coloring_books', 'localcbook00001'],
    ['coloring_mediums', 'localmedium0001'],
  ];

  for (const [collection, id] of required) {
    if (!(await getFixture({ pbUrl, token: auth.token, collection, id }))) {
      throw new Error(`PocketBase bootstrap did not create required fixture ${collection}/${id}.`);
    }
  }

  for (const id of randomizerProjectIds) {
    const project = await getFixture({
      pbUrl,
      token: auth.token,
      collection: 'projects',
      id,
    });
    if (!project) throw new Error(`PocketBase is missing required randomizer fixture ${id}.`);
    if (project.status !== 'progress') {
      throw new Error(`PocketBase randomizer fixture ${id} is not in progress.`);
    }
  }

  const params = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: 'book = "localcbook00001" && page_number = 1',
  });
  const pages = await requestJson(`${pbUrl}/api/collections/coloring_pages/records?${params}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const coloringPageId = pages.items?.[0]?.id;
  if (!coloringPageId) {
    throw new Error('PocketBase bootstrap did not create the required coloring page fixture.');
  }

  return {
    coloringBookId: 'localcbook00001',
    coloringMediumId: 'localmedium0001',
    coloringPageId,
    projectId: 'localproject003',
    randomizerProjectIds,
  };
}

export function parseArgs(argv) {
  const harness = {
    fixedPorts: false,
    runId: new Date().toISOString().replace(/[:.]/g, '-'),
    suite: 'legacy',
  };
  const playwrightArgs = [];

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--run-id=')) {
      harness.runId = arg.slice('--run-id='.length).replace(/[^A-Za-z0-9._-]/g, '-');
      continue;
    }
    if (arg === '--fixed-ports') {
      harness.fixedPorts = true;
      continue;
    }
    if (arg === '--skip-build') {
      throw new Error('--skip-build is not supported without a matching build receipt.');
    }
    if (arg.startsWith('--suite=')) {
      harness.suite = arg.slice('--suite='.length);
      continue;
    }
    playwrightArgs.push(arg);
  }

  if (!['legacy', 'smoke', 'full'].includes(harness.suite)) {
    throw new Error(`Unknown QA suite: ${harness.suite}. Expected legacy, smoke, or full.`);
  }

  if (harness.suite === 'smoke' && playwrightArgs.length > 0) {
    throw new Error('The smoke suite inventory is fixed; remove positional Playwright filters.');
  }
  return {
    harness,
    configPath: harness.suite === 'legacy' ? 'playwright.config.ts' : 'playwright.ci.config.ts',
    playwrightArgs:
      playwrightArgs.length > 0
        ? playwrightArgs
        : harness.suite !== 'legacy'
          ? []
          : ['--project=public', '--project=authenticated'],
  };
}

const resolveRunDir = runId => {
  const runDir = path.resolve(runRoot, runId);
  const relativeRunDir = path.relative(runRoot, runDir);

  if (relativeRunDir === '' || relativeRunDir.startsWith('..') || path.isAbsolute(relativeRunDir)) {
    throw new Error(`Run id must stay inside ${path.relative(rootDir, runRoot)}.`);
  }
  if (existsSync(runDir)) {
    throw new Error(`QA run directory already exists: ${runDir}`);
  }
  return runDir;
};

const copyHooks = pbDir => {
  const sourceHooksDir = path.join(rootDir, 'pb_hooks');
  const targetHooksDir = path.join(pbDir, 'pb_hooks');
  mkdirSync(targetHooksDir, { recursive: true });
  if (!existsSync(sourceHooksDir)) return 0;

  const hookFiles = readdirSync(sourceHooksDir).filter(file => file.endsWith('.js'));
  for (const file of hookFiles) {
    copyFileSync(path.join(sourceHooksDir, file), path.join(targetHooksDir, file));
  }
  return hookFiles.length;
};

const preparePocketBaseBinary = async pbDir => {
  const source = await installPocketBase({ destination: pocketBaseCachePath });
  const target = path.join(pbDir, 'pocketbase');
  copyFileSync(source, target);
  chmodSync(target, 0o755);
  return target;
};

const runSync = ({ command, args, env, logPath, label }) => {
  const result = spawnSync(command, args, { cwd: rootDir, env, encoding: 'utf8' });
  writeFileSync(
    logPath,
    [`$ ${[command, ...args].join(' ')}`, '', result.stdout || '', result.stderr || ''].join('\n')
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}. See ${logPath}`);
  }
  return result;
};

export function seedRandomizerFixturesForSuite({ suite, env, logsDir, runCommand = runSync }) {
  if (suite !== 'full') return [];
  const result = runCommand({
    command: process.execPath,
    args: ['scripts/seed-e2e-randomizer-fixture.mjs'],
    env,
    logPath: path.join(logsDir, 'randomizer-fixture-seed.log'),
    label: 'Randomizer fixture seed',
  });
  return parseRandomizerFixtureIds(result.stdout);
}

export function parseListedTestCount(output) {
  const match = output.match(/Total:\s+(\d+)\s+tests?/);
  if (!match) throw new Error('Playwright did not report a test count during inventory preflight.');
  const count = Number(match[1]);
  if (count < 1) throw new Error('Playwright inventory preflight found no tests.');
  return count;
}

const managedInventory = {
  smoke: { files: 23, tests: 83 },
  full: { files: 40, tests: 274 },
};

export function parseListedInventory(output, suite) {
  const expected = managedInventory[suite];
  if (!expected) throw new Error(`Managed inventory is unavailable for ${suite}.`);
  const match = output.match(/Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/);
  if (!match) throw new Error('Playwright did not report a complete managed test inventory.');
  const actual = { tests: Number(match[1]), files: Number(match[2]) };
  if (actual.tests !== expected.tests || actual.files !== expected.files) {
    throw new Error(
      `The ${suite} suite expected ${expected.tests} tests in ${expected.files} files, ` +
        `but Playwright discovered ${actual.tests} tests in ${actual.files} files.`
    );
  }
  return actual;
}

const collectReportTests = (suites, parents = [], inheritedFile = '') => {
  const collected = [];
  for (const suite of suites) {
    const suiteIsFile = /\.spec\.[cm]?[jt]sx?$/.test(suite.title);
    const file = suite.file || (suiteIsFile ? suite.title : inheritedFile);
    const nextParents = suiteIsFile ? parents : [...parents, suite.title];
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        collected.push({
          ...test,
          file: spec.file || file,
          title: [...nextParents, spec.title].filter(Boolean).join(' › '),
        });
      }
    }
    collected.push(...collectReportTests(suite.suites || [], nextParents, file));
  }
  return collected;
};

const allowedFullSkip = test => {
  const annotations = [...(test.annotations || [])];
  for (const result of test.results || []) annotations.push(...(result.annotations || []));
  return (
    test.projectName === 'authenticated-chromium-full' &&
    test.file?.replaceAll('\\', '/').endsWith('e2e/authenticated/mobile-touch-targets.spec.ts') &&
    test.title.endsWith('mobile touch targets › bottom nav remains anchored during scroll') &&
    annotations.some(
      annotation =>
        annotation.type === 'skip' &&
        annotation.description === 'page too short to verify bottom nav scroll anchoring'
    )
  );
};

export function validateManagedPlaywrightReport(report, suite) {
  const expected = managedInventory[suite];
  if (!expected || !report || !Array.isArray(report.suites) || !report.stats) {
    throw new Error('Playwright structured report is missing or malformed.');
  }
  const tests = collectReportTests(report.suites);
  if (tests.length === 0) throw new Error('Playwright structured report contained no tests.');
  if (tests.length !== expected.tests) {
    throw new Error(
      `Playwright structured report contained ${tests.length} tests; expected ${expected.tests}.`
    );
  }
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    throw new Error('Playwright structured report contained run errors.');
  }

  let passed = 0;
  let skipped = 0;
  for (const test of tests) {
    if (test.status === 'skipped') {
      if (suite !== 'full' || !allowedFullSkip(test)) {
        throw new Error(`Playwright reported an unexpected skip: ${test.title}.`);
      }
      skipped += 1;
      continue;
    }
    const finalResult = test.results?.at(-1);
    if (
      test.status !== 'expected' ||
      test.expectedStatus !== 'passed' ||
      !finalResult ||
      finalResult.status !== 'passed'
    ) {
      throw new Error(`Playwright reported a non-passing managed test: ${test.title}.`);
    }
    passed += 1;
  }

  const stats = report.stats;
  if (
    stats.expected !== passed ||
    stats.skipped !== skipped ||
    stats.unexpected !== 0 ||
    stats.flaky !== 0 ||
    passed + skipped !== expected.tests
  ) {
    throw new Error('Playwright structured report totals do not reconcile.');
  }
  return { expected: passed, skipped, total: tests.length };
}

const stopProcess = async processHandle => {
  if (!processHandle || processHandle.exitCode !== null || processHandle.killed) return;
  processHandle.kill('SIGTERM');
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 5_000);
    processHandle.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
};

const writeReport = ({
  appUrl,
  error,
  listedTestCount,
  logsDir,
  pbUrl,
  playwrightArgs,
  results,
  reportPath,
  runDir,
  status,
  suite,
}) => {
  const commandArgs = [suite === 'legacy' ? '' : `--suite=${suite}`, ...playwrightArgs].filter(
    Boolean
  );
  const content = [
    '# Local PocketBase Release QA Report',
    '',
    `Status: ${status}`,
    `Suite: ${suite}`,
    `Discovered tests: ${listedTestCount ?? 'not reached'}`,
    `Passed tests: ${results?.expected ?? 'not reached'}`,
    `Skipped tests: ${results?.skipped ?? 'not reached'}`,
    `Run directory: ${runDir}`,
    `App URL: ${appUrl}`,
    `PocketBase URL: ${pbUrl}`,
    ...(error ? [`Failure: ${error}`] : []),
    '',
    'Command:',
    '',
    '```bash',
    `pnpm qa:release:local -- ${commandArgs.join(' ')}`.trimEnd(),
    '```',
    '',
    'Artifacts:',
    '',
    `- Playwright report: ${path.join(runDir, 'artifacts', 'playwright-report')}`,
    `- Structured results: ${path.join(runDir, 'artifacts', 'playwright-results.json')}`,
    `- Playwright test results: ${path.join(runDir, 'artifacts', 'test-results')}`,
    `- Logs: ${logsDir}`,
    '',
    'Cleanup:',
    '',
    '- PocketBase and local build server processes stopped by the harness.',
    '- Isolated PocketBase data remains in the run directory for inspection.',
    '',
  ].join('\n');
  writeFileSync(reportPath, content);
};

export async function runLocalReleaseQa(argv = process.argv.slice(2)) {
  const { configPath, harness, playwrightArgs } = parseArgs(argv);
  const runDir = resolveRunDir(harness.runId);
  const pbPort = harness.fixedPorts ? 8090 : await getFreePort();
  const appPort = harness.fixedPorts ? 3000 : await getFreePort();
  await assertPortAvailable(pbPort);
  await assertPortAvailable(appPort);
  const pbUrl = `http://127.0.0.1:${pbPort}`;
  const appUrl = `http://127.0.0.1:${appPort}`;
  assertLocalUrl(pbUrl, 'PocketBase URL');
  assertLocalUrl(appUrl, 'App URL');

  const pbDir = path.join(runDir, 'pocketbase');
  const logsDir = path.join(runDir, 'logs');
  const artifactsDir = path.join(runDir, 'artifacts');
  const reportPath = path.join(runDir, 'release-qa-report.md');
  mkdirSync(pbDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(path.join(runDir, 'auth'), { recursive: true });

  const env = {
    ...qaEnvironment(process.env),
    APP_TEST_ENV: 'test',
    E2E_APP_URL: appUrl,
    E2E_FIXTURE_PROJECT_ID: 'localproject003',
    E2E_QA_SUITE: harness.suite,
    E2E_STORAGE_STATE: path.join(runDir, 'auth', 'user.json'),
    E2E_TEST_EMAIL: defaultTestEmail,
    E2E_TEST_PASSWORD: defaultTestPassword,
    LOCAL_POCKETBASE_ADMIN_EMAIL: adminEmail,
    LOCAL_POCKETBASE_ADMIN_PASSWORD: adminPassword,
    LOCAL_POCKETBASE_ALLOWED_ORIGINS: appUrl,
    LOCAL_POCKETBASE_DIR: pbDir,
    LOCAL_POCKETBASE_TEST_USER_EMAIL: defaultTestEmail,
    LOCAL_POCKETBASE_TEST_USER_PASSWORD: defaultTestPassword,
    LOCAL_POCKETBASE_URL: pbUrl,
    PLAYWRIGHT_HTML_REPORT: path.join(artifactsDir, 'playwright-report'),
    PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(artifactsDir, 'playwright-results.json'),
    PLAYWRIGHT_OUTPUT_DIR: path.join(artifactsDir, 'test-results'),
    PORT: String(appPort),
    VERCEL_ENV: 'test',
    VITE_APP_URL: appUrl,
    VITE_APP_VERSION: `release-qa-${harness.runId}`,
    VITE_POCKETBASE_URL: pbUrl,
  };

  let appProcess;
  let listedTestCount;
  let managedResults;
  let pbProcess;
  let exitStatus = 1;
  let failure;
  const handles = [];

  try {
    const pocketbaseBinary = await preparePocketBaseBinary(pbDir);
    const hookCount = copyHooks(pbDir);
    upsertLocalPocketBaseSuperuser({
      pocketbaseBinary,
      localDir: pbDir,
      email: adminEmail,
      password: adminPassword,
    });

    const pbStdout = openSync(path.join(logsDir, 'pocketbase.stdout.log'), 'a');
    const pbStderr = openSync(path.join(logsDir, 'pocketbase.stderr.log'), 'a');
    handles.push(pbStdout, pbStderr);
    pbProcess = spawn(
      pocketbaseBinary,
      ['serve', `--http=127.0.0.1:${pbPort}`, `--origins=${appUrl}`],
      { cwd: pbDir, env, stdio: ['ignore', pbStdout, pbStderr] }
    );
    await waitForHttp(`${pbUrl}/api/health`, 'PocketBase', { processHandle: pbProcess });

    runSync({
      command: process.execPath,
      args: ['scripts/bootstrap-local-pocketbase.mjs', '--seed', '--no-keepalive'],
      env,
      logPath: path.join(logsDir, 'bootstrap.log'),
      label: 'PocketBase bootstrap',
    });
    const randomizerProjectIds = seedRandomizerFixturesForSuite({
      suite: harness.suite,
      env,
      logsDir,
    });
    const fixtures = await resolveQaFixtures({
      pbUrl,
      email: defaultTestEmail,
      password: defaultTestPassword,
      randomizerProjectIds,
    });
    Object.assign(env, {
      E2E_COLORING_BOOK_ID: fixtures.coloringBookId,
      E2E_COLORING_MEDIUM_ID: fixtures.coloringMediumId,
      E2E_COLORING_PAGE_ID: fixtures.coloringPageId,
      ...(fixtures.randomizerProjectIds.length > 0
        ? { E2E_RANDOMIZER_PROJECT_IDS: fixtures.randomizerProjectIds.join(',') }
        : {}),
    });

    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    runSync({
      command: pnpm,
      args: ['build'],
      env,
      logPath: path.join(logsDir, 'build.log'),
      label: 'Production build',
    });

    const appStdout = openSync(path.join(logsDir, 'app.stdout.log'), 'a');
    const appStderr = openSync(path.join(logsDir, 'app.stderr.log'), 'a');
    handles.push(appStdout, appStderr);
    appProcess = spawn(process.execPath, ['server/local-build-server.js'], {
      cwd: rootDir,
      env,
      stdio: ['ignore', appStdout, appStderr],
    });
    await waitForHttp(appUrl, 'local build server', { processHandle: appProcess });

    const basePlaywrightArgs = ['exec', 'playwright', 'test', '--config', configPath];
    const listResult = runSync({
      command: pnpm,
      args: [...basePlaywrightArgs, ...playwrightArgs, '--list'],
      env,
      logPath: path.join(logsDir, 'playwright-list.log'),
      label: 'Playwright inventory preflight',
    });
    const listedOutput = `${listResult.stdout}\n${listResult.stderr}`;
    listedTestCount =
      harness.suite === 'legacy'
        ? parseListedTestCount(listedOutput)
        : parseListedInventory(listedOutput, harness.suite).tests;

    const result = spawnSync(pnpm, [...basePlaywrightArgs, ...playwrightArgs, '--retries=0'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    exitStatus = result.status ?? 1;
    if (exitStatus !== 0) failure = `Playwright failed with status ${exitStatus}.`;
    if (harness.suite !== 'legacy') {
      try {
        const structuredReportPath = path.join(artifactsDir, 'playwright-results.json');
        if (!existsSync(structuredReportPath) || statSync(structuredReportPath).size === 0) {
          throw new Error('Playwright structured report is missing or empty.');
        }
        managedResults = validateManagedPlaywrightReport(
          JSON.parse(readFileSync(structuredReportPath, 'utf8')),
          harness.suite
        );
      } catch (error) {
        exitStatus = 1;
        failure = error instanceof Error ? error.message : String(error);
      }
    }

    console.log('');
    console.log(`Local release QA run: ${runDir}`);
    console.log(`PocketBase hooks synced: ${hookCount}`);
    console.log(`Playwright tests discovered: ${listedTestCount}`);
    console.log(`Report: ${reportPath}`);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error(failure);
  } finally {
    await stopProcess(appProcess);
    await stopProcess(pbProcess);
    for (const handle of handles) closeSync(handle);
    writeReport({
      appUrl,
      error: failure,
      listedTestCount,
      logsDir,
      pbUrl,
      playwrightArgs,
      results: managedResults,
      reportPath,
      runDir,
      status: exitStatus === 0 ? 'passed' : `failed with status ${exitStatus}`,
      suite: harness.suite,
    });
    if (!existsSync(reportPath) || statSync(reportPath).size === 0) {
      exitStatus = 1;
      console.error('Local release QA Markdown report is missing or empty.');
    }
  }

  return exitStatus;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalReleaseQa().then(
    status => {
      process.exitCode = status;
    },
    error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}
