import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ACTIONLINT_VERSION = '1.7.12';
export const TRANSIENT_DOWNLOAD_STATUSES = new Set([502, 503, 504]);

const archives = {
  'linux-x64': ['linux_amd64', '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'],
  'linux-arm64': [
    'linux_arm64',
    '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6',
  ],
  'darwin-x64': [
    'darwin_amd64',
    '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644',
  ],
  'darwin-arm64': [
    'darwin_arm64',
    'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
  ],
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function downloadActionlintArchive(
  url,
  archivePath,
  { fetchFn = fetch, retries = 4, timeoutMs = 60_000, delayMs = 250, sleepFn = sleep } = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) {
        writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
        return;
      }

      lastError = new Error(`Actionlint download failed (${response.status}).`);
      if (!TRANSIENT_DOWNLOAD_STATUSES.has(response.status)) throw lastError;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Actionlint download failed (') &&
        !TRANSIENT_DOWNLOAD_STATUSES.has(Number(error.message.match(/\((\d+)\)/)?.[1]))
      ) {
        throw error;
      }
      lastError = error;
      if (attempt === retries) throw error;
    }

    if (attempt < retries) await sleepFn(delayMs * attempt);
  }

  throw lastError ?? new Error('Actionlint download failed.');
}

export function verifyActionlintChecksum(archivePath, expectedHash) {
  const actual = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  if (actual === expectedHash) return;
  rmSync(archivePath, { force: true });
  throw new Error('Actionlint archive checksum mismatch.');
}

export async function lintWorkflows() {
  const archive = archives[`${process.platform}-${process.arch}`];
  if (!archive) throw new Error('Workflow validation supports Linux and macOS on x64 and arm64.');
  const [platform, expectedHash] = archive;
  const directory = path.resolve(
    '.tmp',
    'ci-tools',
    `actionlint-${ACTIONLINT_VERSION}-${platform}`
  );
  mkdirSync(directory, { recursive: true });
  const archivePath = path.join(directory, 'actionlint.tar.gz');
  if (!existsSync(archivePath)) {
    await downloadActionlintArchive(
      `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_${platform}.tar.gz`,
      archivePath
    );
  }
  verifyActionlintChecksum(archivePath, expectedHash);
  const extraction = spawnSync('tar', ['-xzf', archivePath, '-C', directory, 'actionlint']);
  if (extraction.error || extraction.status !== 0) throw new Error('Cannot extract actionlint.');
  const binary = path.join(directory, 'actionlint');
  chmodSync(binary, 0o755);
  const workflows = readdirSync('.github/workflows')
    .filter(name => /\.ya?ml$/.test(name))
    .map(name => path.join('.github/workflows', name));
  if (workflows.length === 0) throw new Error('No GitHub Actions workflows found.');
  const result = spawnSync(binary, ['-color', '-shellcheck=', '-pyflakes=', ...workflows], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await lintWorkflows();
}
