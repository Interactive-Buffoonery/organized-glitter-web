#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const POCKETBASE_VERSION = '0.40.5';
export const POCKETBASE_BASELINE_VERSION = '0.40.1';

const BASELINE_ARCHIVES = {
  'darwin-arm64': {
    archive: `pocketbase_0.40.1_darwin_arm64.zip`,
    binarySha256: '56d06ac0acc3dc5573250d90f5b710d848619614e4731e1adb1a47aab159eb85',
    sha256: 'baaa858cbade830804e37a54e5bf43800d8d77beb51c81abaec14d3d81a9a461',
  },
  'darwin-x64': {
    archive: `pocketbase_0.40.1_darwin_amd64.zip`,
    binarySha256: 'bdf85ae391f0321e722717b0126eca71195f05f3a48c43c24fcc1c4cba4b325a',
    sha256: 'c0b6ccf92ee82c1e3fc3fd88d396b7e229bbba1f628ca2888c3277f5dbc2ffa1',
  },
  'linux-arm64': {
    archive: `pocketbase_0.40.1_linux_arm64.zip`,
    binarySha256: '5ebe3101d9ca20b682b35a737d33e600957e5c4fb841b6e7101c8eb58af20627',
    sha256: '8e15eb6080de5ae7fcf789ac963d5c3c9328a491d5f7a24eb13c93a2f4bae4f1',
  },
  'linux-x64': {
    archive: `pocketbase_0.40.1_linux_amd64.zip`,
    binarySha256: 'bfdc715d14d922f3dfcb8333cc439e7eb1d44ed602456662299bf14f4d6387b8',
    sha256: '0f3442d2e57b03b56fbff0d09289e4a30b4f561a44338c38d2dcd4a1a0cfa91e',
  },
};

export const POCKETBASE_ARCHIVES = {
  'darwin-arm64': {
    archive: 'pocketbase_0.40.5_darwin_arm64.zip',
    sha256: 'd9a176e0491bc825fff88c2a4edffb07307f785ac2bd9710e82c5d223669fc17',
    binarySha256: '420d4c192368646c2209ba67c6b741de4a47b2550576dd6676228f6d5c97374c',
  },
  'darwin-x64': {
    archive: 'pocketbase_0.40.5_darwin_amd64.zip',
    sha256: '3640f0c4d9e0e5a47e321f10ddf6698508d4f20721bcf5dfb7c4192835e5105f',
    binarySha256: '918b098e28965613b47645458611fa38a394b8ba4313d9c3c85eacd19399bd10',
  },
  'linux-arm64': {
    archive: 'pocketbase_0.40.5_linux_arm64.zip',
    sha256: '570baa1c45d2fb92fc0073582b945ca0ece03cbf9837ccabf49a222f99dd02e3',
    binarySha256: '86e6a863386091b502068a58edd0f3c3b95f8fd5bd97dc00ec9c7199ec70835e',
  },
  'linux-x64': {
    archive: 'pocketbase_0.40.5_linux_amd64.zip',
    sha256: '1dbea1b01eb3dfe64953513859d01e759c96650c4e3264fa4eecd54b769382e4',
    binarySha256: '6c213b3673c74e08dce6c4c5920ebc33584b53df1edafd04591ddfa3acee76cf',
  },
};

const RELEASES = { '0.40.1': BASELINE_ARCHIVES, '0.40.5': POCKETBASE_ARCHIVES };

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function parseInstallArgs(argv) {
  const destinationArg = argv.find(arg => arg.startsWith('--destination='));
  const destination = destinationArg
    ? path.resolve(rootDir, destinationArg.slice('--destination='.length))
    : path.join(rootDir, '.tmp', 'pocketbase-cache', POCKETBASE_VERSION, 'pocketbase');

  return { destination };
}

export function resolveArchive(
  platform = process.platform,
  arch = process.arch,
  version = POCKETBASE_VERSION
) {
  const release = RELEASES[version]?.[`${platform}-${arch}`];
  if (!release) {
    throw new Error(`PocketBase ${version} installer does not support ${platform}-${arch}.`);
  }
  return release;
}

export function getFileSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function verifyArchive(archivePath, expectedSha256) {
  const actual = getFileSha256(archivePath);
  if (actual !== expectedSha256) {
    throw new Error(
      `PocketBase archive checksum mismatch. Expected ${expectedSha256}, received ${actual}.`
    );
  }
}

const metadataPathFor = destination => `${destination}.release.json`;

export function hasVerifiedCachedBinary(destination, release) {
  if (!existsSync(destination)) return false;
  return getFileSha256(destination) === release.binarySha256;
}

export async function downloadPocketBaseArchive(url, { fetchFn = fetch, sleepFn = sleep } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetchFn(url, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }

    if (response && !response.ok) {
      lastError = new Error(`PocketBase download failed with HTTP ${response.status}: ${url}`);
      await response.body?.cancel();
      if (![500, 502, 503, 504].includes(response.status)) throw lastError;
    }

    if (attempt === 3) throw lastError;
    await sleepFn(250 * attempt);
  }
}

/**
 * Renames finished files into place so concurrent installs sharing one cache
 * never overwrite a binary another process is running or verifying.
 */
export function placeVerifiedBinary(source, destination, metadata) {
  mkdirSync(path.dirname(destination), { recursive: true });
  const staged = `${destination}.${process.pid}.tmp`;
  const stagedMetadata = `${metadataPathFor(destination)}.${process.pid}.tmp`;
  try {
    copyFileSync(source, staged);
    chmodSync(staged, 0o755);
    writeFileSync(stagedMetadata, `${JSON.stringify(metadata, null, 2)}\n`);
    // Metadata goes first: if the binary rename never happens, the old binary
    // fails its checksum on the next run and both files are rewritten.
    renameSync(stagedMetadata, metadataPathFor(destination));
    renameSync(staged, destination);
  } finally {
    rmSync(staged, { force: true });
    rmSync(stagedMetadata, { force: true });
  }
}

export async function installPocketBase({
  destination,
  fetchFn = fetch,
  sleepFn = sleep,
  platform = process.platform,
  arch = process.arch,
  spawnSyncFn = spawnSync,
  version = POCKETBASE_VERSION,
} = {}) {
  if (!destination) throw new Error('PocketBase install destination is required.');

  const release = resolveArchive(platform, arch, version);
  if (hasVerifiedCachedBinary(destination, release)) return destination;

  const downloadUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${release.archive}`;
  const archiveBytes = await downloadPocketBaseArchive(downloadUrl, { fetchFn, sleepFn });

  const temporaryDir = mkdtempSync(path.join(tmpdir(), 'organized-glitter-pocketbase-'));
  const archivePath = path.join(temporaryDir, release.archive);

  try {
    writeFileSync(archivePath, archiveBytes);
    verifyArchive(archivePath, release.sha256);

    const extractedDir = path.join(temporaryDir, 'extracted');
    mkdirSync(extractedDir, { recursive: true });
    const unzip = spawnSyncFn('unzip', ['-q', archivePath, 'pocketbase', '-d', extractedDir], {
      encoding: 'utf8',
    });
    if (unzip.error) throw unzip.error;
    if (unzip.status !== 0) {
      throw new Error(`Could not extract PocketBase archive: ${unzip.stderr || 'unzip failed'}`);
    }

    const extractedBinary = path.join(extractedDir, 'pocketbase');
    if (!existsSync(extractedBinary)) {
      throw new Error('PocketBase archive did not contain the pocketbase executable.');
    }
    if (getFileSha256(extractedBinary) !== release.binarySha256) {
      throw new Error('Extracted PocketBase executable did not match the pinned binary checksum.');
    }

    placeVerifiedBinary(extractedBinary, destination, { version, ...release });
    return destination;
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

async function main() {
  const { destination } = parseInstallArgs(process.argv.slice(2));
  const installed = await installPocketBase({ destination });
  console.log(`PocketBase ${POCKETBASE_VERSION} ready at ${path.relative(rootDir, installed)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
