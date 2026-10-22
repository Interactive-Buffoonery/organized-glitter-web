#!/usr/bin/env node

// Real PocketBase replay checks for the production index inventory: an index
// the inventory lacks is excused only when a newer migration actually leaves
// that exact definition on the same collection.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installPocketBase, POCKETBASE_BASELINE_VERSION } from './install-pocketbase.mjs';
import {
  applyIndexInventory,
  readBaseMigrations,
  replayIndexEvidence,
} from './validate-pocketbase-upgrade.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runRoot = path.join(root, '.tmp', 'index-evidence-replay');
mkdirSync(runRoot, { recursive: true });
const binary = await installPocketBase({
  version: POCKETBASE_BASELINE_VERSION,
  destination: path.join(
    root,
    '.tmp',
    'pocketbase-cache',
    POCKETBASE_BASELINE_VERSION,
    'pocketbase'
  ),
});

const boundary = '1700000000_boundary.js';
const statusIndex = "CREATE INDEX idx_notes_status ON notes (status) WHERE status = 'ACTIVE'";
const jobsIndex = 'CREATE INDEX idx_jobs_status ON jobs (status)';
const statusField = { name: 'status', type: 'text' };
const notes = { name: 'notes', type: 'base', fields: [statusField], indexes: [statusIndex] };
const migration = (up, down = '') => `migrate(
  app => {
    const notes = app.findCollectionByNameOrId('notes');
${up}
  },
  app => {
    const notes = app.findCollectionByNameOrId('notes');
${down}
  }
);
`;
const addStatusIndex = index => `    notes.indexes = [...notes.indexes, ${JSON.stringify(index)}];
    app.save(notes);`;

const evidenceFor = async ({ source, schema = [notes], name = '1800000000_case.js' }) => {
  const inventory = { $inventoryThroughMigration: boundary, notes: [] };
  const replayedIndexes = await replayIndexEvidence({
    schema,
    inventory,
    migrations: [
      { name: boundary, source: 'migrate(() => {}, () => {});\n' },
      { name, source },
    ],
    binary,
    workDir: mkdtempSync(path.join(runRoot, 'case-')),
  });
  return applyIndexInventory(schema, inventory, { replayedIndexes });
};

const rejected = {
  'only a comment names it': migration(`    // ${addStatusIndex(statusIndex)}`),
  'an unused const holds it': migration(`    const sql = ${JSON.stringify(statusIndex)};`),
  'an uncalled function creates it': migration(
    `    function addIndex() {\n${addStatusIndex(statusIndex)}\n    }`
  ),
  'concatenation builds a different definition': migration(
    addStatusIndex('CREATE INDEX idx_notes_status ON notes (status)').replace(
      '"]',
      `" + " WHERE status != ''"]`
    )
  ),
  'the up step creates it and then removes it': migration(
    `${addStatusIndex(statusIndex)}\n    notes.indexes = [];\n    app.save(notes);`
  ),
  'the up step creates it and then drops it in SQL': migration(
    `${addStatusIndex(statusIndex)}\n    app.db().newQuery('DROP INDEX idx_notes_status').execute();`
  ),
  'only the down step creates it': migration('', addStatusIndex(statusIndex)),
  'a quoted literal differs in case': migration(
    addStatusIndex("CREATE INDEX idx_notes_status ON notes (status) WHERE status = 'active'")
  ),
  'it is created on a different collection': migration(`    app.save(new Collection({
      type: 'base',
      name: 'others',
      fields: [{ name: 'status', type: 'text' }],
      indexes: [${JSON.stringify(statusIndex.replace(' ON notes ', ' ON others '))}],
    }));`),
};

for (const [label, source] of Object.entries(rejected)) {
  await assert.rejects(
    evidenceFor({ source }),
    /production index inventory lacks notes\.idx_notes_status/i,
    label
  );
}
await assert.rejects(
  evidenceFor({ source: migration(addStatusIndex(statusIndex)), name: '1600000000_old.js' }),
  /production index inventory lacks notes\.idx_notes_status/i,
  'an inventoried migration creates it'
);

assert.deepEqual(await evidenceFor({ source: migration(addStatusIndex(statusIndex)) }), [notes]);
assert.deepEqual(
  await evidenceFor({
    source: migration(
      addStatusIndex(statusIndex).replace(
        JSON.stringify(statusIndex),
        `${JSON.stringify(statusIndex.slice(0, 20))} + ${JSON.stringify(statusIndex.slice(20))}`
      )
    ),
  }),
  [notes],
  'executed concatenation that yields the exact definition'
);
const jobs = { name: 'jobs', type: 'base', fields: [statusField], indexes: [jobsIndex] };
assert.deepEqual(
  await evidenceFor({
    schema: [{ ...notes, indexes: [] }, jobs],
    source: migration(`    app.save(new Collection({
      type: 'base',
      name: 'jobs',
      fields: [{ name: 'status', type: 'text' }],
      indexes: [${JSON.stringify(jobsIndex)}],
    }));`),
  }),
  [{ ...notes, indexes: [] }, jobs],
  'a collection created after the boundary'
);

const inventory = JSON.parse(
  readFileSync(path.join(root, 'scripts/fixtures/production-index-inventory.json'), 'utf8')
);
const schema = JSON.parse(
  readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')
);
const replayedIndexes = await replayIndexEvidence({
  schema,
  inventory,
  migrations: readBaseMigrations({ baseCommit: 'HEAD' }),
  binary,
  workDir: mkdtempSync(path.join(runRoot, 'repository-')),
});
assert.ok(
  replayedIndexes.account_deletions.includes(
    'CREATE INDEX idx_account_deletions_created ON account_deletions (created)'
  )
);
applyIndexInventory(schema, inventory, { replayedIndexes });

console.log(
  'Index inventory evidence: replay rejects dead, dropped, rollback-only and mismatched creates and accepts real forward creates.'
);
