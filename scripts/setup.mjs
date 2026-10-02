#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SETUP_TARGETS = ['node_modules', 'pnpm-lock.yaml'];

const describeError = error => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
};

export const removeSetupTargets = async ({ targets = SETUP_TARGETS, remove = rm } = {}) => {
  for (const target of targets) {
    try {
      await remove(target, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Failed to remove ${target}; aborting setup before pnpm install. ${describeError(error)}`,
        { cause: error }
      );
    }
  }
};

const runPnpmInstall = ({ spawnCommand = spawn } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawnCommand('pnpm', ['install'], { stdio: 'inherit' });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pnpm install exited with status ${code}`));
    });
  });

export const runSetup = async ({
  removeTargets = removeSetupTargets,
  install = runPnpmInstall,
} = {}) => {
  await removeTargets();
  await install();
};

const main = async () => {
  try {
    await runSetup();
  } catch (error) {
    console.error(`Setup failed: ${describeError(error)}`);
    process.exitCode = 1;
  }
};

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  await main();
}
