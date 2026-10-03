#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const summaryRoot = path.join(rootDir, '.tmp', 'local-validation');
const profiles = new Set(['pr', 'release']);

const sharedPhases = [
  ['static', 'test:ci:static'],
  ['unit', 'test:ci:unit'],
  ['backend', 'test:ci:backend'],
  ['react', 'test:ci:react'],
  ['build', 'test:ci:build'],
  ['publication', 'test:publication'],
  ['not-found', 'test:not-found'],
  ['pwa-navigation', 'test:pwa:navigation'],
];

const trailingBrowserPhases = [
  ['protected-file-browser', 'test:protected-file-rotation-browser'],
  ['blog-browser', 'qa:blog'],
];

export function buildPhasePlan(profile) {
  if (!profiles.has(profile)) throw new Error(`Unknown validation profile: ${profile}`);
  return [
    ...sharedPhases,
    profile === 'release' ? ['browser-full', 'qa:browser:full'] : ['browser-smoke', 'qa:browser'],
    ...trailingBrowserPhases,
  ];
}

export function parseArgs(argv) {
  let base;
  let profile;
  for (const arg of argv) {
    if (arg.startsWith('--base=')) base = arg.slice('--base='.length);
    else if (arg.startsWith('--profile=')) profile = arg.slice('--profile='.length);
    else throw new Error(`Unknown validation argument: ${arg}`);
  }
  if (!base) throw new Error('Local validation requires an explicit --base=<git-ref>.');
  if (!profiles.has(profile)) throw new Error(`Unknown validation profile: ${profile}`);
  return { base, profile };
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
};

const requiredOutput = (command, args, label) => {
  const result = run(command, args);
  if (result.status !== 0 || typeof result.stdout !== 'string' || !result.stdout.trim()) {
    throw new Error(`Could not determine ${label}.`);
  }
  return result.stdout.trim();
};

const hash = value => createHash('sha256').update(value).digest('hex');

const hashFile = relativePath => hash(readFileSync(path.join(rootDir, relativePath)));

const buildConfigDigest = () => {
  const configFiles = ['package.json', 'vite.config.ts', 'blog/astro.config.mjs'];
  const input = configFiles.map(file => `${file}\0${hashFile(file)}`).join('\0');
  return hash(input);
};

export const dirtyIdentity = (directory = rootDir) => {
  const status = run('git', ['status', '--porcelain=v1', '-z'], { cwd: directory });
  const diff = run('git', ['diff', '--binary', 'HEAD'], { cwd: directory });
  const staged = run('git', ['diff', '--binary', '--cached', 'HEAD'], { cwd: directory });
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: directory,
  });
  for (const result of [status, diff, staged, untracked]) {
    if (result.status !== 0 || typeof result.stdout !== 'string') {
      throw new Error('Could not determine the local tree identity.');
    }
  }
  const digest = createHash('sha256')
    .update(status.stdout)
    .update('\0')
    .update(diff.stdout)
    .update('\0')
    .update(staged.stdout);
  const untrackedPaths = untracked.stdout.split('\0').filter(Boolean).sort();
  for (const relativePath of untrackedPaths) {
    const absolutePath = path.join(directory, relativePath);
    const file = lstatSync(absolutePath);
    digest.update('\0').update(relativePath).update('\0');
    digest.update(file.isSymbolicLink() ? readlinkSync(absolutePath) : readFileSync(absolutePath));
  }
  return {
    dirty: status.stdout.length > 0,
    digest: digest.digest('hex'),
  };
};

const publicBuildEnvironmentKeys = [
  'APP_TEST_ENV',
  'BLOG_ENABLED',
  'MAILPOET_IFRAME_URL',
  'PUBLIC_IMAGE_ORIGINS',
  'VITE_APP_URL',
  'VITE_APP_VERSION',
  'VITE_POCKETBASE_URL',
  'VITE_SUPPORT_URL',
  'VITE_UPDATES_URL',
  'WORDPRESS_API_URL',
  'WORDPRESS_CONTACT_URL',
];

export const publicBuildEnvironmentDigest = env =>
  hash(
    JSON.stringify(
      Object.fromEntries(publicBuildEnvironmentKeys.map(key => [key, env[key] ?? null]))
    )
  );

export const localBuildEnvironmentFilesDigest = (directory = rootDir) => {
  const digest = createHash('sha256');
  for (const relativePath of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const file = path.join(directory, relativePath);
    digest.update(relativePath).update('\0');
    if (existsSync(file)) digest.update(readFileSync(file));
    digest.update('\0');
  }
  return digest.digest('hex');
};

const credentialEnvironmentKey =
  /(?:TOKEN|SECRET|PASSWORD|PASSCODE|PRIVATE_KEY|API_KEY|ACCESS_KEY|AUTH|COOKIE|CREDENTIAL)/i;

const safeChildEnvironment = env =>
  Object.fromEntries(Object.entries(env).filter(([key]) => !credentialEnvironmentKey.test(key)));

export const validationEnvironment = (baseSha, env = process.env) => ({
  ...safeChildEnvironment(env),
  CI_BASE_REF: baseSha,
  CI_BASE_SHA: baseSha,
});

export const environmentForPhase = (phase, baseSha, env = process.env, headSha = baseSha) => {
  const environment = validationEnvironment(baseSha, env);
  if (phase !== 'build') return environment;
  return {
    ...environment,
    APP_TEST_ENV: 'test',
    VITE_APP_URL: 'http://127.0.0.1:3000',
    VITE_APP_VERSION: `local-validation-${headSha.slice(0, 12)}`,
    VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
  };
};

const repositoryIdentity = base => ({
  base: {
    ref: base,
    sha: requiredOutput('git', ['rev-parse', '--verify', `${base}^{commit}`], 'base commit'),
  },
  head: {
    commit: requiredOutput('git', ['rev-parse', 'HEAD'], 'HEAD commit'),
    tree: requiredOutput('git', ['rev-parse', 'HEAD^{tree}'], 'HEAD tree'),
    ...dirtyIdentity(),
  },
});

const toolIdentity = () => ({
  git: requiredOutput('git', ['version'], 'Git version'),
  gitleaksExpected: '8.30.1',
  node: process.version,
  pnpm: requiredOutput(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--version'],
    'pnpm version'
  ),
});

const writeSummary = (summaryPath, summary) => {
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
};

export function recordPhaseFailure(phase, error, startedAtMs, finishedAtMs = Date.now()) {
  const errorCode =
    error &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,31}$/.test(error.code)
      ? ` (${error.code})`
      : '';
  phase.durationMs = finishedAtMs - startedAtMs;
  phase.error = `Child process launch failed${errorCode}.`;
  phase.exitCode = null;
  phase.outcome = 'failed';
}

export function runLocalValidation(argv = process.argv.slice(2)) {
  const { base, profile } = parseArgs(argv);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${profile}`;
  const runDir = path.join(summaryRoot, runId);
  const summaryPath = path.join(runDir, 'summary.json');
  mkdirSync(runDir, { recursive: true });
  const repository = repositoryIdentity(base);
  const buildEnvironment = environmentForPhase(
    'build',
    repository.base.sha,
    process.env,
    repository.head.commit
  );

  const summary = {
    schemaVersion: 1,
    profile,
    runId,
    startedAt: new Date().toISOString(),
    outcome: 'running',
    repository,
    platform: {
      architecture: process.arch,
      operatingSystem: process.platform,
      release: os.release(),
    },
    tools: toolIdentity(),
    inputs: {
      lockfileSha256: hashFile('pnpm-lock.yaml'),
      buildConfigSha256: buildConfigDigest(),
      localBuildEnvironmentFilesSha256: localBuildEnvironmentFilesDigest(),
      publicBuildEnvironmentSha256: publicBuildEnvironmentDigest(buildEnvironment),
    },
    phases: [],
  };
  writeSummary(summaryPath, summary);
  process.stdout.write(`Local validation summary: ${summaryPath}\n`);

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  for (const [name, script] of buildPhasePlan(profile)) {
    const startedAt = new Date();
    const phase = {
      name,
      script,
      startedAt: startedAt.toISOString(),
      outcome: 'running',
    };
    summary.phases.push(phase);
    writeSummary(summaryPath, summary);
    process.stdout.write(`\n[local-validation] ${name}: pnpm ${script}\n`);
    let result;
    try {
      result = run(pnpm, [script], {
        env: environmentForPhase(name, repository.base.sha, process.env, repository.head.commit),
        stdio: 'inherit',
        encoding: undefined,
      });
    } catch (error) {
      recordPhaseFailure(phase, error, startedAt.getTime());
      summary.outcome = 'failed';
      summary.failure = phase.error;
      summary.finishedAt = new Date().toISOString();
      writeSummary(summaryPath, summary);
      return 1;
    }
    phase.durationMs = Date.now() - startedAt.getTime();
    phase.exitCode = result.status;
    phase.outcome = result.status === 0 ? 'passed' : 'failed';
    writeSummary(summaryPath, summary);
    if (result.status !== 0) {
      summary.outcome = 'failed';
      summary.finishedAt = new Date().toISOString();
      writeSummary(summaryPath, summary);
      return result.status ?? 1;
    }
  }

  summary.outcome = 'passed';
  summary.finishedAt = new Date().toISOString();
  writeSummary(summaryPath, summary);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runLocalValidation();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
