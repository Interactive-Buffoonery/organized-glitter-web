#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkPublicationFiles } from './check-publication-files.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = '8.30.1';
const cacheRoot = path.join(rootDir, '.tmp', 'gitleaks', version);
const releaseRoot = `https://github.com/gitleaks/gitleaks/releases/download/v${version}`;
const archives = {
  'darwin-arm64': [
    'darwin_arm64',
    'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  ],
  'darwin-x64': ['darwin_x64', 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709'],
  'linux-arm64': [
    'linux_arm64',
    'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  ],
  'linux-x64': ['linux_x64', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
};

export function resolveGitleaksArchive(platform = process.platform, arch = process.arch) {
  const release = archives[`${platform}-${arch}`];
  if (!release) throw new Error(`Verified Gitleaks is unavailable for ${platform}-${arch}.`);
  const [suffix, sha256] = release;
  const archive = `gitleaks_${version}_${suffix}.tar.gz`;
  return { archive, sha256, url: `${releaseRoot}/${archive}` };
}

const fileSha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

const assertChecksum = (file, expected) => {
  const actual = fileSha256(file);
  if (actual !== expected) {
    throw new Error(
      `Gitleaks archive checksum mismatch: expected ${expected}, received ${actual}.`
    );
  }
};

const download = async ({ destination, url }) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Gitleaks download failed with HTTP ${response.status}.`);
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
};

const commandResult = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });

export function extractVerifiedGitleaks({
  archivePath,
  binaryPath,
  hostDir,
  runCommand = commandResult,
}) {
  const extracted = runCommand('tar', ['-xzf', archivePath, '-C', hostDir, 'gitleaks']);
  if (extracted.error || extracted.status !== 0) {
    throw new Error('Could not extract the verified Gitleaks scanner.');
  }
  chmodSync(binaryPath, 0o755);
}

const ensureVerifiedGitleaks = async () => {
  const release = resolveGitleaksArchive();
  const hostDir = path.join(cacheRoot, `${process.platform}-${process.arch}`);
  const archivePath = path.join(hostDir, release.archive);
  const binaryPath = path.join(hostDir, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
  mkdirSync(hostDir, { recursive: true });
  if (!existsSync(archivePath)) await download({ destination: archivePath, url: release.url });
  assertChecksum(archivePath, release.sha256);

  extractVerifiedGitleaks({ archivePath, binaryPath, hostDir });

  const versionResult = commandResult(binaryPath, ['version']);
  if (
    versionResult.error ||
    versionResult.status !== 0 ||
    typeof versionResult.stdout !== 'string' ||
    versionResult.stdout.trim() !== version
  ) {
    throw new Error(`Verified Gitleaks ${version} did not report the expected version.`);
  }
  return binaryPath;
};

const scannerArgs = config => [
  '--config',
  config,
  '--redact=100',
  '--ignore-gitleaks-allow',
  '--no-banner',
];

export function publicationScanPlan(repository, trackedTree, currentSourceTree) {
  const config = path.join(repository, '.gitleaks.toml');
  return [
    {
      label: 'complete Git history',
      target: repository,
      args: ['git', '--log-opts=--all', ...scannerArgs(config)],
    },
    {
      label: 'clean tracked tree',
      target: trackedTree,
      args: ['dir', trackedTree, ...scannerArgs(config)],
    },
    ...(currentSourceTree
      ? [
          {
            label: 'current source tree',
            target: currentSourceTree,
            args: ['dir', currentSourceTree, ...scannerArgs(config)],
          },
        ]
      : []),
    {
      label: 'generated website',
      target: path.join(repository, 'dist'),
      args: ['dir', path.join(repository, 'dist'), ...scannerArgs(config)],
    },
  ];
}

export function assertScannerResult(result, label) {
  if (result.error) throw new Error(`Gitleaks could not run for ${label}: ${result.error.message}`);
  if (!Number.isInteger(result.status)) {
    throw new Error(`Gitleaks did not report an exit status for ${label}.`);
  }
  if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    throw new Error(`Gitleaks output was unavailable for ${label}.`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0)
    throw new Error(`Gitleaks ${label} scan failed with status ${result.status}.`);
}

const archiveTrackedTree = target => {
  const archive = commandResult('git', ['archive', 'HEAD'], { encoding: undefined });
  if (archive.error || archive.status !== 0 || !Buffer.isBuffer(archive.stdout)) {
    throw new Error('Could not create the clean tracked-tree archive.');
  }
  const extracted = commandResult('tar', ['-x', '-C', target], {
    input: archive.stdout,
  });
  if (extracted.error || extracted.status !== 0) {
    throw new Error('Could not extract the clean tracked-tree archive.');
  }
};

export function copyPublicationSourceTree(repository, target) {
  const listed = commandResult(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repository }
  );
  if (listed.error || listed.status !== 0 || typeof listed.stdout !== 'string') {
    throw new Error('Could not list the current publication source tree.');
  }
  for (const relativePath of listed.stdout.split('\0').filter(Boolean)) {
    const source = path.join(repository, relativePath);
    if (!existsSync(source)) continue;
    const destination = path.resolve(target, relativePath);
    const relativeDestination = path.relative(target, destination);
    if (relativeDestination.startsWith('..') || path.isAbsolute(relativeDestination)) {
      throw new Error('Publication source path escaped the temporary scan tree.');
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    if (lstatSync(source).isSymbolicLink()) symlinkSync(readlinkSync(source), destination);
    else copyFileSync(source, destination);
  }
}

export async function runPublicationValidation() {
  if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    throw new Error(
      'Publication validation requires generated dist/index.html output. Run pnpm build first.'
    );
  }
  checkPublicationFiles(rootDir);
  const scanner = await ensureVerifiedGitleaks();
  const trackedTree = mkdtempSync(path.join(os.tmpdir(), 'organized-glitter-publication-'));
  const currentSourceTree = mkdtempSync(
    path.join(os.tmpdir(), 'organized-glitter-publication-source-')
  );
  try {
    archiveTrackedTree(trackedTree);
    copyPublicationSourceTree(rootDir, currentSourceTree);
    for (const scan of publicationScanPlan(rootDir, trackedTree, currentSourceTree)) {
      assertScannerResult(commandResult(scanner, scan.args), scan.label);
    }
  } finally {
    rmSync(trackedTree, { recursive: true, force: true });
    rmSync(currentSourceTree, { recursive: true, force: true });
  }
  process.stdout.write(`Publication validation passed with verified Gitleaks ${version}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runPublicationValidation();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
