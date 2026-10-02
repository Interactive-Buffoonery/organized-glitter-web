#!/usr/bin/env node

// Run the disposable PocketBase upgrade fixture while Playwright keeps a page open.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture =
  process.env.PROTECTED_FILE_UPGRADE_SCRIPT ??
  path.join(root, 'scripts/test-protected-file-upgrade.mjs');
if (!existsSync(fixture)) throw new Error(`Missing protected-file fixture: ${fixture}`);

const browser = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const runner = process.env.OG_BROWSER_RUNNER ?? 'pnpm';
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${browser}`;
const artifactDir = path.join(root, '.tmp', 'protected-file-browser-qa', runId);
mkdirSync(artifactDir, { recursive: true });

// Keep the fixture and its PocketBase child in one process group for fallback cleanup.
const fixtureProcess = spawn(
  process.execPath,
  [
    fixture,
    `--rotation-migration=${path.join(root, 'pb_migrations/1790268636_rotate_users_file_token.js')}`,
    '--browser-gate',
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], detached: process.platform !== 'win32' }
);
const fixtureClosed = new Promise(resolve => {
  fixtureProcess.once('close', code => resolve(code ?? 1));
  fixtureProcess.once('error', () => resolve(1));
});
let gatePath;
let gate;
let browserProcess;
let browserClosed;
const killProcessTree = (child, signal) => {
  try {
    if (!child?.pid) return;
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`taskkill exited ${result.status}: ${result.stderr.trim()}`);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error(`Could not stop process tree: ${error.message}`);
      child.kill('SIGKILL');
    }
  }
};
let interruptedSignal;
let rejectInterruption;
const interruption = new Promise((_, reject) => {
  rejectInterruption = reject;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    killProcessTree(browserProcess, 'SIGTERM');
    killProcessTree(fixtureProcess, 'SIGTERM');
    rejectInterruption(new Error(`Interrupted by ${signal}`));
  });
}
let fixtureOutput = '';
const ready = new Promise((resolve, reject) => {
  fixtureProcess.stdout.on('data', chunk => {
    const text = chunk.toString();
    process.stdout.write(text);
    fixtureOutput += text;
    const match = fixtureOutput.match(/Browser gate ready: (.+browser-gate\.json)/);
    if (match) resolve(match[1].trim());
  });
  fixtureProcess.once('error', reject);
  fixtureProcess.once('exit', code =>
    reject(new Error(`Protected-file fixture exited before browser gate (${code})`))
  );
});

let exitCode = 1;
try {
  gatePath = await Promise.race([ready, interruption]);
  gate = JSON.parse(readFileSync(gatePath, 'utf8'));
  const command = runner === 'og-test-pr' ? 'og-test-pr' : 'pnpm';
  const spec = 'e2e/authenticated/protected-file-rotation-local.spec.ts';
  const args =
    runner === 'og-test-pr'
      ? ['pnpm', 'exec', 'playwright', 'test', '--project=authenticated', spec]
      : ['exec', 'playwright', 'test', '--project=authenticated', spec];
  browserProcess = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      VITE_POCKETBASE_URL: gate.url,
      E2E_TEST_EMAIL: gate.ownerEmail,
      E2E_TEST_PASSWORD: gate.password,
      PROTECTED_FILE_BROWSER_GATE: gatePath,
      E2E_IMAGE_BROWSER: browser,
      PLAYWRIGHT_OUTPUT_DIR: path.join(artifactDir, 'results'),
      PLAYWRIGHT_HTML_REPORT: path.join(artifactDir, 'report'),
    },
  });
  browserClosed = new Promise(resolve => {
    browserProcess.once('close', code => resolve(code ?? 1));
    browserProcess.once('error', error => {
      console.error(`Browser runner could not start: ${error.message}`);
      resolve(1);
    });
  });
  exitCode = await Promise.race([browserClosed, interruption]);
} catch (error) {
  console.error(`Browser QA failed: ${error.message}`);
  exitCode = 1;
} finally {
  let signalFailed = false;
  if (gatePath && !interruptedSignal) {
    const runDir = gate?.runDir ?? path.dirname(gatePath);
    try {
      if (!existsSync(path.join(runDir, 'rotated.ready'))) {
        writeFileSync(path.join(runDir, 'rotate.ready'), 'rotate');
      }
    } catch (error) {
      console.error(`Could not signal file rotation: ${error.message}`);
      signalFailed = true;
    }
    try {
      writeFileSync(path.join(runDir, 'browser.done'), 'done');
    } catch (error) {
      console.error(`Could not close browser gate: ${error.message}`);
      signalFailed = true;
    }
  }
  if (signalFailed || interruptedSignal) {
    killProcessTree(fixtureProcess, 'SIGTERM');
    if (process.platform !== 'win32') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      killProcessTree(fixtureProcess, 'SIGKILL');
      if (interruptedSignal) killProcessTree(browserProcess, 'SIGKILL');
    }
    let closeTimer;
    const closed = await Promise.race([
      Promise.all([fixtureClosed, browserClosed ?? Promise.resolve(0)]),
      new Promise(resolve => {
        closeTimer = setTimeout(() => resolve(null), 5000);
      }),
    ]);
    clearTimeout(closeTimer);
    if (closed === null) {
      console.error('Browser or fixture did not close after cleanup');
      fixtureProcess.stdout.destroy();
      fixtureProcess.unref();
      browserProcess?.unref();
    }
  } else {
    const fixtureCode = await fixtureClosed;
    if (fixtureCode !== 0) exitCode = 1;
  }
  if (signalFailed) exitCode = 1;
  if (interruptedSignal) exitCode = interruptedSignal === 'SIGINT' ? 130 : 143;
}
console.log(
  `Browser QA ${exitCode === 0 ? 'passed' : 'failed'}; report: ${path.join(artifactDir, 'report')}`
);
process.exitCode = exitCode;
