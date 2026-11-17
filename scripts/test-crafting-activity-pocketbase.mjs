import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
mkdirSync(path.join(root, '.tmp'), { recursive: true });
const directory = mkdtempSync(path.join(root, '.tmp/crafting-activity-pb-'));
const password = 'crafting-activity-password-123';
const adminEmail = 'crafting-activity-admin@example.test';
const schema = JSON.parse(readFileSync('docs/pocketbase/collections.schema.json', 'utf8'));
const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});
const SLOT_MS = 15 * 60 * 1000;
const slotOf = ms => new Date(Math.floor(ms / SLOT_MS) * SLOT_MS).toISOString().replace('T', ' ');
const slotsBetween = (start, end) => {
  const slots = new Set([slotOf(end)]);
  for (let ms = start; ms < end; ms += 60_000) slots.add(slotOf(ms));
  return [...slots];
};
const reject = (promise, status) =>
  assert.rejects(promise, error => error.status === status, `expected ${status}`);

async function startServer(name) {
  const dataDir = path.join(directory, name, 'data');
  const hooksDir = path.join(directory, name, 'hooks');
  const migrationsDir = path.join(directory, name, 'migrations');
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(migrationsDir, { recursive: true });
  cpSync(path.join(root, 'pb_hooks'), hooksDir, { recursive: true });
  writeFileSync(
    path.join(hooksDir, 'test-crafting.pb.js'),
    `routerAdd('POST', '/api/test/crafting/table/{state}', e => {
const off = e.request.pathValue('state') === 'off';
e.app.db().newQuery(off ? 'ALTER TABLE crafting_activity RENAME TO crafting_activity_off' : 'ALTER TABLE crafting_activity_off RENAME TO crafting_activity').execute();
return e.noContent(204);
}, $apis.requireAuth('_superusers'));\n`
  );
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const setup = spawnSync(
    binary,
    ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(setup.status, 0, setup.stderr);
  let output = '';
  const server = spawn(
    binary,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${dataDir}`,
      `--hooksDir=${hooksDir}`,
      `--migrationsDir=${migrationsDir}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  server.stdout.on('data', chunk => (output += chunk.toString()));
  server.stderr.on('data', chunk => (output += chunk.toString()));
  const url = `http://127.0.0.1:${port}`;
  const admin = new PocketBase(url);
  admin.autoCancellation(false);
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 100) throw new Error(`PocketBase stopped: ${output}`);
    try {
      await admin.health.check();
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await admin.collection('_superusers').authWithPassword(adminEmail, password);
  await admin.collections.import(schema, false);
  const stop = () =>
    new Promise(resolve => {
      if (server.exitCode !== null || server.signalCode !== null) return resolve();
      server.once('exit', resolve);
      server.kill('SIGTERM');
    });
  const account = async username => {
    const user = await admin.collection('users').create({
      email: `${username}@example.test`,
      username,
      password,
      passwordConfirm: password,
      verified: true,
    });
    const client = new PocketBase(url);
    client.autoCancellation(false);
    await client.collection('users').authWithPassword(user.email, password);
    return { user, client };
  };
  return { admin, account, stop, dataDir, migrationsDir, output: () => output };
}

const migrate = (dataDir, migrationsDir, direction) =>
  spawnSync(
    binary,
    [
      'migrate',
      direction,
      ...(direction === 'down' ? ['1'] : []),
      `--dir=${dataDir}`,
      `--migrationsDir=${migrationsDir}`,
      '--automigrate=false',
    ],
    { encoding: 'utf8', input: 'y\n' }
  );

const live = await startServer('live');
try {
  const { admin, account } = live;
  const activityOf = userId =>
    admin.collection('crafting_activity').getFullList({ filter: `user = '${userId}'` });
  const tag = (who, name) => ({ user: who.user.id, name, slug: name, color: '#ffffff' });

  const a = await account('crafter-a');
  const b = await account('crafter-b');
  const started = Date.now();
  const created = await a.client.collection('tags').create(tag(a, 'alpha'));
  await a.client.collection('tags').update(created.id, { name: 'alpha-two' });
  await a.client.collection('tags').delete(created.id);
  const finished = Date.now();
  const aSlots = (await activityOf(a.user.id)).map(row => row.slot).sort();
  assert.ok(aSlots.length >= 1 && aSlots.length <= 2, JSON.stringify(aSlots));
  for (const slot of aSlots) assert.ok(slotsBetween(started, finished).includes(slot), slot);
  assert.deepEqual(await activityOf(b.user.id), [], 'writes never log for another user');

  const own = await a.client.collection('crafting_activity').getFullList();
  assert.deepEqual(own.map(row => row.slot).sort(), aSlots);
  assert.deepEqual(await b.client.collection('crafting_activity').getFullList(), []);
  await reject(
    a.client.collection('crafting_activity').create({ user: a.user.id, slot: aSlots[0] }),
    403
  );
  await reject(
    a.client.collection('crafting_activity').update(own[0].id, { slot: aSlots[0] }),
    403
  );
  await reject(a.client.collection('crafting_activity').delete(own[0].id), 403);

  await reject(b.client.collection('tags').create(tag(a, 'not-yours')), 400);
  assert.deepEqual(await activityOf(b.user.id), [], 'rejected writes do not log');

  const c = await account('crafter-c');
  await admin.collection('tags').create(tag(c, 'by-admin'));
  assert.deepEqual(await activityOf(c.user.id), [], 'superuser writes do not log');

  await admin.settings.update({
    batch: { enabled: true, maxRequests: 10, timeout: 3, maxBodySize: 0 },
  });
  const batch = c.client.createBatch();
  batch.collection('tags').create(tag(c, 'batched'));
  await batch.send();
  assert.equal((await activityOf(c.user.id)).length, 1, '/api/batch writes log activity');

  const d = await account('crafter-d');
  const book = await admin
    .collection('coloring_books')
    .create({ user: d.user.id, title: 'Setup', total_pages: 1, status: 'in_progress' });
  const page = await admin.collection('coloring_pages').getFirstListItem(`book = '${book.id}'`);
  assert.deepEqual(await activityOf(d.user.id), []);
  await reject(
    d.client.send('/api/coloring/color-keys/setup', {
      method: 'POST',
      body: { page: page.id, symbols: [] },
    }),
    400
  );
  assert.deepEqual(await activityOf(d.user.id), [], 'failed custom routes do not log');
  await d.client.send('/api/coloring/color-keys/setup', {
    method: 'POST',
    body: { page: page.id, symbols: ['u:0031'] },
  });
  assert.equal((await activityOf(d.user.id)).length, 1, 'custom write routes log activity');

  const e = await account('crafter-e');
  await admin.send('/api/test/crafting/table/off', { method: 'POST' });
  try {
    await e.client.collection('tags').create(tag(e, 'still-saved'));
  } finally {
    await admin.send('/api/test/crafting/table/on', { method: 'POST' });
  }
  assert.equal(
    (await admin.collection('tags').getFullList({ filter: `user = '${e.user.id}'` })).length,
    1
  );
  assert.deepEqual(await activityOf(e.user.id), [], 'a failed log leaves the write intact');
  for (let i = 0; ; i++) {
    const warnings = await admin.logs.getList(1, 1, {
      filter: "message = 'Crafting activity was not recorded'",
    });
    if (warnings.totalItems === 1) break;
    assert.ok(i < 100, 'the failed log leaves a warning');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const marks = 'crafting_day_marks';
  const utcDay = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const mark = await a.client.collection(marks).create({ user: a.user.id, day: utcDay(-6) });
  assert.equal(mark.day, utcDay(-6));
  await a.client.collection(marks).create({ user: a.user.id, day: utcDay(0) });
  assert.equal((await a.client.collection(marks).getFullList()).length, 2);
  await reject(a.client.collection(marks).create({ user: a.user.id, day: utcDay(0) }), 400);
  await reject(a.client.collection(marks).create({ user: a.user.id, day: utcDay(-30) }), 400);
  await reject(a.client.collection(marks).create({ user: a.user.id, day: utcDay(3) }), 400);
  await reject(a.client.collection(marks).create({ user: a.user.id, day: '2026-02-30' }), 400);
  await reject(a.client.collection(marks).create({ user: a.user.id, day: 'soon' }), 400);
  await reject(a.client.collection(marks).update(mark.id, { day: utcDay(-1) }), 403);
  assert.deepEqual(await b.client.collection(marks).getFullList(), []);
  await reject(b.client.collection(marks).getOne(mark.id), 404);
  await reject(b.client.collection(marks).delete(mark.id), 404);
  await reject(b.client.collection(marks).create({ user: a.user.id, day: utcDay(-1) }), 400);
  await a.client.collection(marks).delete(mark.id);
  assert.equal((await a.client.collection(marks).getFullList()).length, 1);

  await admin.collection('users').delete(a.user.id);
  assert.deepEqual(await activityOf(a.user.id), [], 'activity cascades with the account');
  assert.deepEqual(
    await admin.collection(marks).getFullList({ filter: `user = '${a.user.id}'` }),
    [],
    'marks cascade with the account'
  );
} finally {
  await live.stop();
}

const backfill = await startServer('backfill');
let fixtures;
try {
  const { admin, account } = backfill;
  const owner = await account('backfill-owner');
  const other = await account('backfill-other');
  const project = await admin.collection('projects').create({
    user: owner.user.id,
    title: 'Backfill kit',
    status: 'stash',
    kit_category: 'full',
  });
  const note = await admin
    .collection('progress_notes')
    .create({ project: project.id, date: '2026-11-10 00:00:00.000Z', content: 'note' });
  const book = await admin
    .collection('coloring_books')
    .create({ user: other.user.id, title: 'Backfill book', total_pages: 1, status: 'in_progress' });
  const page = await admin.collection('coloring_pages').getFirstListItem(`book = '${book.id}'`);
  fixtures = { owner: owner.user.id, other: other.user.id, project, note, book, page };
} finally {
  await backfill.stop();
}

{
  const { dataDir, migrationsDir } = backfill;
  const dbPath = path.join(dataDir, 'data.db');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('DELETE FROM crafting_activity');
    const stamp = (table, id, created, updated) =>
      db
        .prepare(`UPDATE ${table} SET created = ?, updated = ? WHERE id = ?`)
        .run(created, updated, id);
    stamp('projects', fixtures.project.id, '2026-11-01 09:07:00.000Z', '2026-11-01 09:14:59.999Z');
    stamp(
      'progress_notes',
      fixtures.note.id,
      '2026-11-02 23:59:59.000Z',
      '2026-11-03 00:00:00.000Z'
    );
    stamp(
      'coloring_books',
      fixtures.book.id,
      '2026-11-04 10:30:00.000Z',
      '2026-11-04 10:30:00.000Z'
    );
    db.prepare('UPDATE coloring_pages SET created = ?, updated = ? WHERE book = ?').run(
      '2026-11-04 10:44:00.000Z',
      '2026-11-05 08:15:00.000Z',
      fixtures.book.id
    );
    db.prepare(
      'INSERT INTO tags (id, user, name, slug, color, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'orphantag000001',
      'missinguser0001',
      'orphan',
      'orphan',
      '#ffffff',
      '2026-11-06 12:00:00.000Z',
      '2026-11-06 12:00:00.000Z'
    );
  } finally {
    db.close();
  }
  const name = '1792700005_backfill_crafting_activity.js';
  copyFileSync(path.join(root, 'pb_migrations', name), path.join(migrationsDir, name));
  const expected = [
    [fixtures.owner, '2026-11-01 09:00:00.000Z'],
    [fixtures.owner, '2026-11-02 23:45:00.000Z'],
    [fixtures.owner, '2026-11-03 00:00:00.000Z'],
    [fixtures.other, '2026-11-04 10:30:00.000Z'],
    [fixtures.other, '2026-11-05 08:15:00.000Z'],
  ]
    .map(row => row.join(' '))
    .sort();
  const rows = () => {
    const check = new DatabaseSync(dbPath);
    try {
      return check.prepare('SELECT id, user, slot, created, updated FROM crafting_activity').all();
    } finally {
      check.close();
    }
  };
  let result = migrate(dataDir, migrationsDir, 'up');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const first = rows();
  assert.deepEqual(first.map(row => `${row.user} ${row.slot}`).sort(), expected);
  for (const row of first) {
    assert.match(row.id, /^[a-z0-9]{15}$/);
    assert.match(row.created, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(row.created, row.updated);
  }
  const db2 = new DatabaseSync(dbPath);
  try {
    db2.prepare('DELETE FROM _migrations WHERE file = ?').run(name);
  } finally {
    db2.close();
  }
  result = migrate(dataDir, migrationsDir, 'up');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(
    rows()
      .map(row => row.id)
      .sort(),
    first.map(row => row.id).sort(),
    'backfill is idempotent'
  );
}

const created = path.join(directory, 'collections');
const createdData = path.join(created, 'data');
const createdMigrations = path.join(created, 'migrations');
mkdirSync(createdMigrations, { recursive: true });
const collectionsMigration = '1792700004_created_crafting_streak_collections.js';
copyFileSync(
  path.join(root, 'pb_migrations', collectionsMigration),
  path.join(createdMigrations, collectionsMigration)
);
for (const direction of ['up', 'down', 'up']) {
  const result = migrate(createdData, createdMigrations, direction);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const createdDb = new DatabaseSync(path.join(createdData, 'data.db'));
try {
  createdDb
    .prepare(
      "INSERT INTO crafting_day_marks (id, user, day, created, updated) VALUES ('markfixture0001', 'fixtureuser0001', '2026-11-14', '', '')"
    )
    .run();
} finally {
  createdDb.close();
}
const refused = migrate(createdData, createdMigrations, 'down');
assert.notEqual(refused.status, 0, 'populated marks must refuse rollback');

console.log(
  'Crafting activity: 15-minute slots, owner-only logging and reads, batch and custom routes, nonfatal logging, marks rules and window, cascades, backfill and rollback guard passed'
);
