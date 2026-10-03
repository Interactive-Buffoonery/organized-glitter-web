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
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const POCKETBASE_VERSION = '0.40.4';
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
    archive: 'pocketbase_0.40.4_darwin_arm64.zip',
    sha256: 'eeb619ea4f8a06421daedb946d133bed269fea334a760941d147f76befc25ebc',
    binarySha256: '510df5401d2f0e4f91b19ab644760783b4edddf7db21e7d63935b2520966a906',
  },
  'darwin-x64': {
    archive: 'pocketbase_0.40.4_darwin_amd64.zip',
    sha256: '052906521f09f6f23405cd804c930d2b7a1f8eee06d39b85723b5054b2acb4e4',
    binarySha256: '1eb547415d4b248bc522fc085c1449be3ffc145344e15a2365f2dcd26001a405',
  },
  'linux-arm64': {
    archive: 'pocketbase_0.40.4_linux_arm64.zip',
    sha256: '86095bf8ed9345954f0d2bf0a5fb9b57584ae60b77ebf3b6cd23a8003a3fd418',
    binarySha256: 'ff4b3cad4a43123e88272cc0f1aad7f1b40279e266b2ea62e376fa008f765e3e',
  },
  'linux-x64': {
    archive: 'pocketbase_0.40.4_linux_amd64.zip',
    sha256: '9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa',
    binarySha256: '14ec215bc7aaceda356713cd4b29aa7fcfee854ff2ae1151c5ddba41b43aec8a',
  },
};

const RELEASES = { '0.40.1': BASELINE_ARCHIVES, '0.40.4': POCKETBASE_ARCHIVES };

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

export async function installPocketBase({
  destination,
  fetchFn = fetch,
  platform = process.platform,
  arch = process.arch,
  spawnSyncFn = spawnSync,
  version = POCKETBASE_VERSION,
} = {}) {
  if (!destination) throw new Error('PocketBase install destination is required.');

  const release = resolveArchive(platform, arch, version);
  if (hasVerifiedCachedBinary(destination, release)) return destination;

  const downloadUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${release.archive}`;
  const response = await fetchFn(downloadUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`PocketBase download failed with HTTP ${response.status}: ${downloadUrl}`);
  }

  const temporaryDir = mkdtempSync(path.join(tmpdir(), 'organized-glitter-pocketbase-'));
  const archivePath = path.join(temporaryDir, release.archive);

  try {
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
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

    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(extractedBinary, destination);
    chmodSync(destination, 0o755);
    writeFileSync(
      metadataPathFor(destination),
      `${JSON.stringify({ version, ...release }, null, 2)}\n`
    );
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
