import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const hostedStorageStatePath = path.resolve(
  rootDir,
  process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json'
);
