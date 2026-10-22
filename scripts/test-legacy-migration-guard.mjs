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

const GUARD = '1778499999_skip_already_applied_legacy.js';
const LEGACY = [
  '1778500000_add_users_coloring_walkthrough_seen.js',
  '1778600000_int_306_stats_native_readiness.js',
  '1778700000_randomizer_spins_owner_update_rule.js',
];
const COLOR_COUNT = '1792600000_projects_color_count_min_zero.js';
const IMPORT = '1700000000_import_canonical_schema.js';
const LEGACY_STATE = '1700000001_legacy_state.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaJson = readFileSync(
  path.join(root, 'docs', 'pocketbase', 'collections.schema.json'),
  'utf8'
);

mkdirSync(path.join(root, '.tmp'), { recursive: true });
const runDir = mkdtempSync(path.join(root, '.tmp', 'legacy-migration-guard-'));

// Recreates the state just before 1778500000: no walkthrough field, the legacy
// progress-note rule, a public spin update rule and none of the stats indexes.
const LEGACY_STATE_SOURCE = `
migrate(app => {
  const users = app.findCollectionByNameOrId('users');
  users.fields.removeByName('coloring_walkthrough_seen');
  app.save(users);
  const notes = app.findCollectionByNameOrId('coloring_page_progress_notes');
  ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].forEach(field => {
    notes[field] = 'user = @request.auth.id\\n';
  });
  app.save(notes);
  const spins = app.findCollectionByNameOrId('randomizer_spins');
  spins.updateRule = '';
  app.save(spins);
  const stats = /idx_coloring_(books_user_status|books_user_last_activity_at|pages_status|pages_completed_at|pages_book_status)\\b/;
  ['coloring_books', 'coloring_pages'].forEach(name => {
    const collection = app.findCollectionByNameOrId(name);
    collection.indexes = collection.indexes.filter(index => !stats.test(index));
    app.save(collection);
  });
});
`;

const binary = await installPocketBase({
  destination: path.join(root, '.tmp', 'pocketbase-cache', POCKETBASE_VERSION, 'pocketbase'),
});

let counter = 0;
const migrationsDir = files => {
  const dir = path.join(runDir, `migrations-${counter++}`);
  mkdirSync(dir);
  for (const [file, source] of Object.entries(files)) {
    if (source === null) copyFileSync(path.join(root, 'pb_migrations', file), path.join(dir, file));
    else writeFileSync(path.join(dir, file), source);
  }
  return dir;
};
const repoFiles = names => Object.fromEntries(names.map(name => [name, null]));

const migrateUp = (dataDir, dir) =>
  spawnSync(binary, ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${dir}`], {
    encoding: 'utf8',
  });
const applied = result =>
  [...`${result.stdout}${result.stderr}`.matchAll(/Applied (\S+)/g)].map(match => match[1]);

const query = (dataDir, sql, ...params) => {
  const db = new DatabaseSync(path.join(dataDir, 'data.db'));
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
};
const collections = dataDir =>
  query(
    dataDir,
    `SELECT id, name, type, listRule, viewRule, createRule, updateRule, deleteRule,
      fields, indexes, options FROM _collections ORDER BY id`
  ).map(row => ({ ...row }));
const migrationRows = dataDir =>
  Object.fromEntries(
    query(dataDir, 'SELECT file, applied FROM _migrations').map(row => [row.file, row.applied])
  );
const colorCountMin = dataDir =>
  JSON.parse(
    query(dataDir, "SELECT fields FROM _collections WHERE name = 'projects'")[0].fields
  ).find(field => field.name === 'color_count').min;

const setup = {
  [IMPORT]: `migrate(app => app.importCollectionsByMarshaledJSON(${JSON.stringify(schemaJson)}, false));`,
};
const build = (label, files) => {
  const dataDir = path.join(runDir, label);
  const result = migrateUp(dataDir, migrationsDir(files));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return dataDir;
};
const copy = (from, label) => {
  const dataDir = path.join(runDir, label);
  cpSync(from, dataDir, { recursive: true });
  return dataDir;
};

try {
  // Fresh install: the guard finds no applied effects and every legacy file runs.
  const freshBase = build('fresh-base', { ...setup, [LEGACY_STATE]: LEGACY_STATE_SOURCE });
  const withGuard = copy(freshBase, 'fresh-guard');
  const withoutGuard = copy(freshBase, 'fresh-plain');
  let result = migrateUp(
    withGuard,
    migrationsDir({
      ...setup,
      [LEGACY_STATE]: LEGACY_STATE_SOURCE,
      ...repoFiles([GUARD, ...LEGACY]),
    })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(applied(result), [GUARD, ...LEGACY]);
  result = migrateUp(
    withoutGuard,
    migrationsDir({ ...setup, [LEGACY_STATE]: LEGACY_STATE_SOURCE, ...repoFiles(LEGACY) })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(collections(withGuard), collections(withoutGuard), 'fresh schema changed');

  // Production-like: the canonical schema already holds every legacy effect.
  const prodBase = build('prod-base', setup);
  const control = copy(prodBase, 'prod-control');
  result = migrateUp(control, migrationsDir({ ...setup, ...repoFiles(LEGACY) }));
  assert.notEqual(result.status, 0, 'legacy files should fail on production indexes');

  const guarded = copy(prodBase, 'prod-guard');
  query(guarded, 'INSERT INTO _migrations (file, applied) VALUES (?, ?)', LEGACY[0], 123);
  const before = collections(guarded);
  result = migrateUp(guarded, migrationsDir({ ...setup, ...repoFiles([GUARD, ...LEGACY]) }));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(applied(result), [GUARD]);
  assert.deepEqual(collections(guarded), before, 'production schema changed');
  const rows = migrationRows(guarded);
  assert.equal(rows[LEGACY[0]], 123, 'existing history row must be kept');
  for (const file of LEGACY.slice(1)) {
    assert.ok(Number.isInteger(rows[file]) && rows[file] > 1e15, `${file} history row`);
  }

  // color_count.min moves from 1 to 0 and otherwise stays put.
  for (const [label, start, expected] of [
    ['min-one', 1, 0],
    ['min-zero', 0, 0],
    ['min-five', 5, 5],
  ]) {
    const dataDir = copy(prodBase, label);
    const fields = JSON.parse(
      query(dataDir, "SELECT fields FROM _collections WHERE name = 'projects'")[0].fields
    );
    fields.find(field => field.name === 'color_count').min = start;
    query(
      dataDir,
      "UPDATE _collections SET fields = ? WHERE name = 'projects'",
      JSON.stringify(fields)
    );
    result = migrateUp(dataDir, migrationsDir({ ...setup, ...repoFiles([COLOR_COUNT]) }));
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(colorCountMin(dataDir), expected, label);
  }

  console.log('legacy migration guard and color count checks passed');
} finally {
  rmSync(runDir, { recursive: true, force: true });
}
