import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

export function selectSimulator({ devices }, requested) {
  for (const [runtime, entries] of Object.entries(devices)) {
    if (!runtime.startsWith('com.apple.CoreSimulator.SimRuntime.iOS-26-')) continue;
    for (const device of entries) {
      if (
        requested &&
        device.udid === requested &&
        device.isAvailable &&
        device.deviceTypeIdentifier?.startsWith('com.apple.CoreSimulator.SimDeviceType.iPhone')
      )
        return requested;
    }
  }
  throw new Error('An explicit available iOS 26 iPhone simulator is required.');
}

export function nativeTestEnvironment(env, url, password) {
  const safe = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR', 'DEVELOPER_DIR'].filter(key => env[key]).map(key => [key, env[key]])
  );
  return {
    ...safe,
    TEST_RUNNER_RUN_SEEDED_POCKETBASE: '1',
    TEST_RUNNER_SEEDED_PB_URL: url,
    TEST_RUNNER_SEEDED_PB_IDENTITY: 'native-sync@example.test',
    TEST_RUNNER_SEEDED_PB_PASSWORD: password,
  };
}

export function prepareSeededTest(source) {
  const guard = 'guard environment["RUN_SEEDED_POCKETBASE"] == "1" else {';
  if (!source.includes(guard)) throw new Error('Seeded test guard unavailable.');
  return source.replace(
    guard,
    '#expect(environment["RUN_SEEDED_POCKETBASE"] == "1")\n    ' + guard
  );
}

export function nativeTestArguments(output, simulator) {
  return [
    'test',
    '-project',
    'OrganizedGlitter.xcodeproj',
    '-scheme',
    'OrganizedGlitter',
    '-destination',
    `platform=iOS Simulator,id=${simulator}`,
    '-derivedDataPath',
    path.join(output, 'DerivedData'),
    '-resultBundlePath',
    path.join(output, 'NativeIntegration.xcresult'),
    '-parallel-testing-enabled',
    'NO',
    '-only-testing:OrganizedGlitterTests/PocketBaseClientTests/seededBackendRoundTripsDisposableRecordsAndMultipartFiles()',
  ];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60 * 1000,
    killSignal: 'SIGKILL',
    ...options,
  });
  if (result.error || result.status !== 0) throw new Error('Integration subprocess failed.');
  return result.stdout;
}

async function runAsync(command, args, options) {
  const child = spawn(command, args, { stdio: 'ignore', ...options });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
  try {
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error('Native integration failed.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyNativeIntegration({ root, nativeRoot, simulator, output }) {
  const unavailable = reason => ({ outcome: 'not-run', reason });
  if (process.platform !== 'darwin')
    return unavailable('Native integration requires macOS and Xcode.');
  if (!simulator)
    return unavailable(
      'Set NATIVE_SYNC_SIMULATOR_ID or --simulator to an available iOS 26 iPhone.'
    );
  let server;
  let stage = 'prerequisites';
  let resultPath;
  try {
    if (!output) return unavailable('Choose a report output directory for isolated integration.');
    resultPath = path.join(output, 'NativeIntegration.xcresult');
    selectSimulator(
      JSON.parse(
        run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { timeout: 30 * 1000 })
      ),
      simulator
    );
    if (
      run('git', ['-C', nativeRoot, 'status', '--porcelain=v1', '--untracked-files=no']).trim() ||
      run('git', ['-C', nativeRoot, 'ls-files', '--others', '--exclude-standard', '--', 'ios'])
        .split('\n')
        .some(file => file.endsWith('.swift'))
    )
      return unavailable(
        'Commit or stash native tracked changes before integration. Source review uses the working tree; integration runs an isolated committed snapshot.'
      );
    stage = 'native snapshot';
    const nativeDir = path.join(output, 'native-source');
    const dataDir = path.join(output, 'pocketbase-data');
    const hooksDir = path.join(output, 'pocketbase-hooks');
    if ([nativeDir, dataDir, resultPath].some(existsSync))
      return unavailable(
        'Choose a fresh report output directory for isolated integration. Existing artifacts were preserved.'
      );
    mkdirSync(nativeDir, { recursive: true });
    mkdirSync(hooksDir, { recursive: true });
    const archive = path.join(output, 'native-source.tar');
    run('git', ['-C', nativeRoot, 'archive', '--format=tar', `--output=${archive}`, 'HEAD']);
    run('tar', ['-xf', archive, '-C', nativeDir]);
    const iosDir = path.join(nativeDir, 'ios');
    const testSource = readFileSync(
      path.join(iosDir, 'OrganizedGlitterTests/PocketBaseClientTests.swift'),
      'utf8'
    );
    if (!testSource.includes('func seededBackendRoundTripsDisposableRecordsAndMultipartFiles'))
      return unavailable('This native revision does not contain the seeded integration test.');
    writeFileSync(
      path.join(iosDir, 'OrganizedGlitterTests/PocketBaseClientTests.swift'),
      prepareSeededTest(testSource)
    );
    for (const file of readdirSync(path.join(root, 'pb_hooks')).filter(file =>
      file.endsWith('.js')
    ))
      copyFileSync(path.join(root, 'pb_hooks', file), path.join(hooksDir, file));
    stage = 'disposable backend';
    const binary = await installPocketBase({
      destination: path.join(root, '.tmp/native-sync-tools/pocketbase'),
    });
    const socket = net.createServer();
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.listen(0, '127.0.0.1', resolve);
    });
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const url = `http://127.0.0.1:${port}`;
    const password = 'native-sync-disposable-password-123';
    run(binary, [
      'superuser',
      'upsert',
      'native-sync-admin@example.test',
      password,
      `--dir=${dataDir}`,
    ]);
    server = spawn(
      binary,
      [
        'serve',
        `--http=127.0.0.1:${port}`,
        `--dir=${dataDir}`,
        `--hooksDir=${hooksDir}`,
        '--automigrate=false',
      ],
      { stdio: 'ignore', env: nativeTestEnvironment(process.env, url, password) }
    );
    server.on('error', () => {});
    const admin = new PocketBase(url);
    admin.autoCancellation(false);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Disposable server stopped.');
      try {
        await admin.health.check();
        ready = true;
        break;
      } catch {
        await sleep(100);
      }
    }
    if (!ready) throw new Error('Disposable server unavailable.');
    await admin
      .collection('_superusers')
      .authWithPassword('native-sync-admin@example.test', password);
    await admin.collections.import(
      JSON.parse(readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')),
      false
    );
    await admin.collection('users').create({
      email: 'native-sync@example.test',
      username: 'native-sync',
      password,
      passwordConfirm: password,
      verified: true,
    });
    writeFileSync(
      path.join(iosDir, 'Config/Debug.local.xcconfig'),
      `POCKETBASE_BASE_URL = http:/$()/127.0.0.1:${port}\n`
    );
    stage = 'Xcode project generation';
    run('xcodegen', ['generate'], { cwd: iosDir });
    stage = 'Swift integration test';
    await runAsync('xcodebuild', nativeTestArguments(output, simulator), {
      cwd: iosDir,
      env: nativeTestEnvironment(process.env, url, password),
    });
    stage = 'test execution evidence';
    const summary = JSON.parse(
      run('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', resultPath])
    );
    if (summary.passedTests !== 1 || summary.failedTests !== 0 || summary.skippedTests !== 0)
      throw new Error('Seeded test execution was not confirmed.');
    return {
      outcome: 'passed',
      passedTests: summary.passedTests,
      resultBundle: resultPath,
      reason:
        'Actual Swift client seeded test passed for authentication, record create/read/update/delete, multipart uploads, and protected files. Mobile sync retries and offline behavior are not covered by this test. Candidate schema and hooks were tested on a fresh server; migration upgrades remain covered by the existing backend gate.',
    };
  } catch {
    return {
      outcome: stage === 'prerequisites' ? 'not-run' : 'failed',
      ...(resultPath && existsSync(resultPath) ? { resultBundle: resultPath } : {}),
      stage,
      reason: `Native integration did not complete at ${stage}. Inspect the local result bundle when available, check prerequisites, and reproduce before deciding whether the app or backend needs a fix.`,
    };
  } finally {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit').catch(() => {});
      server.kill('SIGTERM');
      const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timeout);
    }
  }
}
