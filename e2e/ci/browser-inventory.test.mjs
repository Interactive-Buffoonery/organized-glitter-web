import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { browserSpecInventory } from './browser-inventory.mjs';

const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const findSpecs = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findSpecs(entryPath);
      return entry.isFile() && entry.name.endsWith('.spec.ts') ? [entryPath] : [];
    })
  );
  return nested.flat();
};

test('classifies every Playwright spec exactly once', async () => {
  const files = (await findSpecs(e2eDir))
    .map(file => path.relative(e2eDir, file).split(path.sep).join('/'))
    .sort();
  const classified = Object.values(browserSpecInventory).flat().sort();

  assert.deepEqual(classified, [...new Set(classified)], 'inventory contains duplicate specs');
  assert.deepEqual(classified, files);
});
