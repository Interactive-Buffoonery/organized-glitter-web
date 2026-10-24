import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installPocketBase, POCKETBASE_VERSION } from './install-pocketbase.mjs';

const MIGRATION = '1792500000_restore_verified_rules.js';
const RULE_FIELDS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const WEAK_NOTE_RULE = 'user = @request.auth.id && page.book.user = @request.auth.id';
const WEAK_SPIN_UPDATE_RULE = 'user = @request.auth.id';
const CUSTOM_RULE = '@request.auth.verified = true && user = @request.auth.id && 1 = 1';
// Production stores this equivalent verified rule with a newline before ')'.
const PRODUCTION_NOTE_RULE =
  '@request.auth.verified = true && (user = @request.auth.id && page.book.user = @request.auth.id\n)';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaJson = readFileSync(
  path.join(root, 'docs', 'pocketbase', 'collections.schema.json'),
  'utf8'
);
const schema = JSON.parse(schemaJson);
const canonical = name => schema.find(collection => collection.name === name);

mkdirSync(path.join(root, '.tmp'), { recursive: true });
const runDir = mkdtempSync(path.join(root, '.tmp', 'restore-verified-rules-'));
const migrationsDir = path.join(runDir, 'migrations');

const readRules = dataDir => {
  const db = new DatabaseSync(path.join(dataDir, 'data.db'), { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT name, ${RULE_FIELDS.join(', ')} FROM _collections
        WHERE name IN ('coloring_page_progress_notes', 'randomizer_spins')`
      )
      .all();
    return Object.fromEntries(rows.map(({ name, ...rules }) => [name, { ...rules }]));
  } finally {
    db.close();
  }
};

const setRules = (dataDir, name, rules) => {
  const db = new DatabaseSync(path.join(dataDir, 'data.db'));
  try {
    for (const [field, value] of Object.entries(rules)) {
      db.prepare(`UPDATE _collections SET ${field} = ? WHERE name = ?`).run(value, name);
    }
  } finally {
    db.close();
  }
};

try {
  mkdirSync(migrationsDir);
  writeFileSync(
    path.join(migrationsDir, '1700000000_import_canonical_schema.js'),
    `migrate(app => app.importCollectionsByMarshaledJSON(${JSON.stringify(schemaJson)}, false));`
  );
  const binary = await installPocketBase({
    destination: path.join(root, '.tmp', 'pocketbase-cache', POCKETBASE_VERSION, 'pocketbase'),
  });
  const migrateUp = dataDir => {
    const result = spawnSync(
      binary,
      ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${migrationsDir}`],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };

  const baseDir = path.join(runDir, 'base');
  migrateUp(baseDir);
  copyFileSync(path.join(root, 'pb_migrations', MIGRATION), path.join(migrationsDir, MIGRATION));

  const notes = canonical('coloring_page_progress_notes');
  const spins = canonical('randomizer_spins');
  const expected = {
    coloring_page_progress_notes: Object.fromEntries(RULE_FIELDS.map(f => [f, notes[f]])),
    randomizer_spins: Object.fromEntries(RULE_FIELDS.map(f => [f, spins[f]])),
  };

  const scenario = (label, prepare, expectedRules) => {
    const dataDir = path.join(runDir, label);
    cpSync(baseDir, dataDir, { recursive: true });
    prepare(dataDir);
    migrateUp(dataDir);
    assert.deepEqual(readRules(dataDir), expectedRules, label);
  };

  scenario(
    'weakened',
    dataDir => {
      setRules(
        dataDir,
        'coloring_page_progress_notes',
        Object.fromEntries(RULE_FIELDS.map(f => [f, WEAK_NOTE_RULE]))
      );
      setRules(dataDir, 'randomizer_spins', { updateRule: WEAK_SPIN_UPDATE_RULE });
    },
    expected
  );

  scenario('canonical', () => {}, expected);

  scenario(
    'custom',
    dataDir => {
      setRules(
        dataDir,
        'coloring_page_progress_notes',
        Object.fromEntries(RULE_FIELDS.map(f => [f, PRODUCTION_NOTE_RULE]))
      );
      setRules(dataDir, 'randomizer_spins', { updateRule: CUSTOM_RULE });
    },
    {
      coloring_page_progress_notes: Object.fromEntries(
        RULE_FIELDS.map(f => [f, PRODUCTION_NOTE_RULE])
      ),
      randomizer_spins: { ...expected.randomizer_spins, updateRule: CUSTOM_RULE },
    }
  );

  console.log('restore verified rules migration checks passed');
} finally {
  rmSync(runDir, { recursive: true, force: true });
}
