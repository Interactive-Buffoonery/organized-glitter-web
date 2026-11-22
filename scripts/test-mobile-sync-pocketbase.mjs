import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import net from 'node:net';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), 'og-mobile-sync-'));
const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
mkdirSync(hooksDir);
for (const file of readdirSync(path.join(root, 'pb_hooks')).filter(name => name.endsWith('.js'))) {
  copyFileSync(path.join(root, 'pb_hooks', file), path.join(hooksDir, file));
}
const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const password = 'mobile-sync-test-password-123';
// Choose a server day that differs from UTC so the UTC fallback test can distinguish both.
const timezone = new Date().getUTCHours() < 11 ? 'Etc/GMT+12' : 'Pacific/Kiritimati';
const setup = spawnSync(
  binary,
  ['superuser', 'upsert', 'sync-admin@example.test', password, `--dir=${dataDir}`],
  { encoding: 'utf8' }
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
    '--automigrate=false',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TZ: timezone } }
);
server.stdout.on('data', chunk => (output += chunk.toString()));
server.stderr.on('data', chunk => (output += chunk.toString()));

try {
  const admin = new PocketBase(url);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`PocketBase stopped: ${output}`);
    try {
      await admin.health.check();
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await admin.collection('_superusers').authWithPassword('sync-admin@example.test', password);
  const schema = JSON.parse(
    readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')
  );
  await admin.collections.import(schema, false);
  const createUser = async name =>
    admin.collection('users').create({
      email: `${name}@example.test`,
      username: name,
      password,
      passwordConfirm: password,
      verified: true,
    });
  const owner = await createUser('sync-owner');
  const other = await createUser('sync-other');
  await admin.collection('users').update(owner.id, { timezone });
  const accountDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const ownerClient = new PocketBase(url);
  await ownerClient.collection('users').authWithPassword(owner.email, password);
  const otherClient = new PocketBase(url);
  await otherClient.collection('users').authWithPassword(other.email, password);
  const project = await admin
    .collection('projects')
    .create({ user: owner.id, title: 'First', status: 'stash', kit_category: 'full' });
  await admin
    .collection('progress_notes')
    .create({ project: project.id, date: '2026-09-27', content: '<p>Private note</p>' });
  const endpoint = `${url}/api/mobile/sync`;
  const request = (client, route, body) =>
    fetch(`${endpoint}/${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: client.authStore.token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await fetch(`${endpoint}/snapshot`)).status, 401);
  const snapshot = await request(ownerClient, 'snapshot');
  assert.equal(snapshot.status, 200, `${await snapshot.clone().text()}\n${output}`);
  assert.equal(snapshot.headers.get('cache-control'), 'private, no-store');
  const initial = await snapshot.json();
  assert.equal(initial.version, 1);
  assert.equal(initial.projects.length, 1);
  assert.equal(initial.projects[0].id, project.id);
  assert.equal(initial.progressNotes.length, 1);
  assert.deepEqual((await (await request(otherClient, 'snapshot')).json()).projects, []);
  const largeNotes = 'é'.repeat(2_200_000);
  const largeProjects = [];
  for (let i = 0; i < 3; i += 1) {
    largeProjects.push(
      await admin.collection('projects').create({
        user: owner.id,
        title: `Large ${i}`,
        status: 'stash',
        kit_category: 'full',
        general_notes: largeNotes,
      })
    );
  }
  const withinLimit = await request(ownerClient, 'snapshot');
  assert.equal(withinLimit.status, 200);
  assert.ok(Buffer.byteLength(await withinLimit.text(), 'utf8') <= 16 * 1024 * 1024);
  largeProjects.push(
    await admin.collection('projects').create({
      user: owner.id,
      title: 'Large 3',
      status: 'stash',
      kit_category: 'full',
      general_notes: largeNotes,
    })
  );
  const oversizedSnapshot = await request(ownerClient, 'snapshot');
  assert.equal(oversizedSnapshot.status, 413, 'UTF-8 response bytes must stay under 16 MiB');
  assert.equal((await oversizedSnapshot.json()).reason, 'snapshot_too_large');
  for (const largeProject of largeProjects)
    await admin.collection('projects').delete(largeProject.id);
  const operation = {
    operationId: 'test-operation-0001',
    collection: 'projects',
    recordId: project.id,
    base: { title: 'First' },
    patch: { title: 'Second' },
  };
  const tooLarge = await request(ownerClient, 'apply', {
    ...operation,
    patch: { title: 'x'.repeat(40000) },
  });
  assert.equal(tooLarge.status, 413);
  const blocked = await request(otherClient, 'apply', operation);
  assert.equal(blocked.status, 404);
  const applied = await request(ownerClient, 'apply', operation);
  assert.equal(applied.status, 200, `${await applied.clone().text()}\n${output}`);
  assert.equal(applied.headers.get('cache-control'), 'private, no-store');
  assert.equal((await applied.json()).record.title, 'Second');
  await admin.collection('projects').update(project.id, { general_notes: 'Unrelated web edit' });
  const replayed = await request(ownerClient, 'apply', operation);
  assert.equal(replayed.status, 200);
  const replayedBody = await replayed.json();
  assert.equal(replayedBody.outcome, 'replayed');
  assert.equal(replayedBody.record.title, 'Second');
  assert.equal(replayedBody.record.general_notes, 'Unrelated web edit');
  const reused = await request(ownerClient, 'apply', { ...operation, patch: { title: 'Third' } });
  assert.equal(reused.status, 409);
  const reusedBody = await reused.json();
  assert.equal(reusedBody.reason, 'operation_id_reused', JSON.stringify(reusedBody));
  const collisionProject = await admin
    .collection('projects')
    .create({ user: owner.id, title: 'Collision test', status: 'stash', kit_category: 'full' });
  const collisionOperation = {
    operationId: 'collision-operation-0001',
    collection: 'projects',
    recordId: collisionProject.id,
    base: { title: 'Collision test' },
    patch: { title: 'Collision handled' },
  };
  const oldReceiptId = createHash('sha256')
    .update(`${owner.id}\0${collisionOperation.operationId}`)
    .digest('hex')
    .slice(0, 15);
  await admin.collection('mobile_sync_receipts').create({
    id: oldReceiptId,
    user: other.id,
    operation_id: collisionOperation.operationId,
    request_hash: createHash('sha256').update('unrelated payload').digest('hex'),
  });
  const collided = await request(ownerClient, 'apply', collisionOperation);
  assert.equal(collided.status, 200, `${await collided.clone().text()}\n${output}`);
  assert.equal((await collided.json()).outcome, 'updated');
  const collisionReplay = await request(ownerClient, 'apply', collisionOperation);
  assert.equal(collisionReplay.status, 200);
  assert.equal((await collisionReplay.json()).outcome, 'replayed');
  assert.equal(
    (await admin.collection('projects').getOne(collisionProject.id)).title,
    'Collision handled'
  );
  const conflict = await request(ownerClient, 'apply', {
    ...operation,
    operationId: 'test-operation-0002',
    patch: { title: 'Third' },
  });
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.equal(conflictBody.reason, 'field_conflict');
  assert.equal(conflictBody.record.title, 'Second');
  const merged = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0003',
    collection: 'projects',
    recordId: project.id,
    base: { title: 'Second' },
    patch: { title: 'Third' },
  });
  assert.equal(merged.status, 200, `${await merged.text()}\n${output}`);
  assert.equal(
    (await admin.collection('projects').getOne(project.id)).general_notes,
    'Unrelated web edit'
  );
  const forbidden = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0004',
    collection: 'projects',
    recordId: project.id,
    base: { user: owner.id },
    patch: { user: other.id },
  });
  assert.equal(forbidden.status, 400);
  const otherCompany = await admin
    .collection('companies')
    .create({ user: other.id, name: 'Private company' });
  const foreignRelation = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0005',
    collection: 'projects',
    recordId: project.id,
    base: { company: '' },
    patch: { company: otherCompany.id },
  });
  assert.equal(foreignRelation.status, 400);
  const otherArtist = await admin
    .collection('artists')
    .create({ user: other.id, name: 'Private artist' });
  const ownCompany = await admin
    .collection('companies')
    .create({ user: owner.id, name: 'My company' });
  const ownRelation = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0008',
    collection: 'projects',
    recordId: project.id,
    base: { company: null },
    patch: { company: ownCompany.id },
  });
  assert.equal(ownRelation.status, 200, `${await ownRelation.clone().text()}\n${output}`);
  const ownRelationBody = await ownRelation.json();
  assert.equal(ownRelationBody.record.company, ownCompany.id);
  assert.equal(ownRelationBody.record.expand.company.name, 'My company');
  const tag = await admin
    .collection('tags')
    .create({ user: owner.id, name: 'Bright', slug: 'bright', color: '#ff0000' });
  await admin.collection('project_tags').create({ project: project.id, tag: tag.id });
  const poisoned = await admin.collection('projects').create({
    user: owner.id,
    title: 'Legacy mixed relation',
    status: 'stash',
    kit_category: 'full',
    company: otherCompany.id,
    artist: otherArtist.id,
  });
  const sortCompany = await admin
    .collection('companies')
    .create({ user: owner.id, name: 'Sort company' });
  const ownedSortProject = await admin.collection('projects').create({
    user: owner.id,
    title: 'Owned relation',
    status: 'stash',
    kit_category: 'full',
    company: sortCompany.id,
  });
  assert.equal(ownedSortProject.company_name_sort, 'sort company');
  assert.equal(ownedSortProject.company_sort_order, 0);
  const assertNoForeignSortNames = (record, context) => {
    assert.equal(record.company_name_sort, '', `${context}: company_name_sort`);
    assert.equal(record.artist_name_sort, '', `${context}: artist_name_sort`);
    assert.equal(record.company_sort_order, 1, `${context}: company_sort_order`);
    assert.equal(record.artist_sort_order, 1, `${context}: artist_sort_order`);
  };
  assertNoForeignSortNames(
    await ownerClient.collection('projects').getOne(poisoned.id),
    'owner view of legacy project'
  );
  const poisonedApply = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0010',
    collection: 'projects',
    recordId: poisoned.id,
    base: { title: 'Legacy mixed relation' },
    patch: { title: 'Legacy renamed' },
  });
  assert.equal(poisonedApply.status, 200, `${await poisonedApply.clone().text()}\n${output}`);
  const poisonedApplyRecord = (await poisonedApply.json()).record;
  assertNoForeignSortNames(poisonedApplyRecord, 'apply response');
  assert.equal(poisonedApplyRecord.expand.company, undefined);
  assert.equal(poisonedApplyRecord.expand.artist, undefined);
  await otherClient.collection('companies').update(otherCompany.id, { name: 'Renamed private' });
  await otherClient.collection('artists').update(otherArtist.id, { name: 'Renamed artist' });
  assertNoForeignSortNames(
    await admin.collection('projects').getOne(poisoned.id),
    'after foreign rename'
  );
  await ownerClient.collection('companies').update(sortCompany.id, { name: 'Renamed sort' });
  assert.equal(
    (await admin.collection('projects').getOne(ownedSortProject.id)).company_name_sort,
    'renamed sort'
  );
  const legacyDb = new DatabaseSync(path.join(dataDir, 'data.db'));
  try {
    legacyDb.exec('PRAGMA busy_timeout = 5000');
    legacyDb
      .prepare(
        `UPDATE projects SET company_name_sort = ?, artist_name_sort = ?,
         company_sort_order = 0, artist_sort_order = 0 WHERE id = ?`
      )
      .run('renamed private', 'renamed artist', poisoned.id);
  } finally {
    legacyDb.close();
  }
  const migrationsDir = path.join(directory, 'migrations');
  mkdirSync(migrationsDir);
  copyFileSync(
    path.join(root, 'pb_migrations', '1792400000_clear_foreign_taxonomy_sort_names.js'),
    path.join(migrationsDir, '1792400000_clear_foreign_taxonomy_sort_names.js')
  );
  const migrated = spawnSync(
    binary,
    ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${migrationsDir}`],
    { encoding: 'utf8' }
  );
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  assertNoForeignSortNames(
    await admin.collection('projects').getOne(poisoned.id),
    'after legacy cleanup migration'
  );
  assert.equal(
    (await admin.collection('projects').getOne(ownedSortProject.id)).company_name_sort,
    'renamed sort'
  );
  assert.equal(
    (await admin.collection('projects').getOne(ownedSortProject.id)).company_sort_order,
    0
  );
  await admin.collection('projects').delete(ownedSortProject.id);
  await admin.collection('companies').delete(sortCompany.id);
  const book = await admin
    .collection('coloring_books')
    .create({ user: owner.id, title: 'Book', status: 'in_stash', total_pages: 1 });
  const pages = await admin
    .collection('coloring_pages')
    .getList(1, 10, { filter: `book = '${book.id}'` });
  assert.equal(pages.items.length, 1);
  const page = pages.items[0];
  await admin
    .collection('coloring_page_progress_notes')
    .create({ user: owner.id, page: page.id, date: '2026-09-27', content: 'Private page note' });
  const withBook = await request(ownerClient, 'snapshot');
  const full = await withBook.json();
  assert.equal(
    full.projects.find(item => item.id === project.id).expand.company.name,
    'My company'
  );
  assert.equal(
    full.projects.find(item => item.id === project.id).expand.project_tags_via_project[0].expand.tag
      .name,
    'Bright'
  );
  assert.equal(full.projects.find(item => item.id === poisoned.id).expand.company, undefined);
  assert.equal(full.coloringBooks.length, 1);
  assert.equal(full.coloringPages.length, 1);
  assert.equal(full.coloringPages[0].book, book.id);
  assert.equal(full.coloringPages[0].expand.book.title, 'Book');
  assert.equal(full.coloringPageProgressNotes.length, 1);
  const missingGroup = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0006',
    collection: 'coloring_pages',
    recordId: page.id,
    base: { status: 'not_started' },
    patch: { status: 'in_progress' },
  });
  assert.equal(missingGroup.status, 400);
  const pageBaseline = Object.fromEntries(
    ['status', 'started_at', 'completed_at', 'revealed_at', 'revealed_subject'].map(key => [
      key,
      page[key],
    ])
  );
  const updatePage = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0007',
    collection: 'coloring_pages',
    recordId: page.id,
    base: pageBaseline,
    patch: { status: 'in_progress' },
  });
  assert.equal(updatePage.status, 200, `${await updatePage.clone().text()}\n${output}`);
  const updatedPage = (await updatePage.json()).record;
  assert.equal(updatedPage.status, 'in_progress');
  assert.equal(updatedPage.started_at, page.started_at, 'status-only sync preserves started_at');
  assert.equal(
    updatedPage.completed_at,
    page.completed_at,
    'status-only sync preserves completed_at'
  );
  assert.ok(
    (await admin.collection('coloring_books').getOne(book.id)).last_activity_at,
    'the page persistence hook updates book activity'
  );
  const otherMedium = await admin.collection('coloring_mediums').create({
    user: other.id,
    name: 'Private medium',
    type: 'colored_pencil',
  });
  const foreignMedium = await request(ownerClient, 'apply', {
    operationId: 'test-operation-0009',
    collection: 'coloring_pages',
    recordId: page.id,
    base: { mediums: [] },
    patch: { mediums: [otherMedium.id] },
  });
  assert.equal(foreignMedium.status, 400);
  await admin.collection('coloring_books').delete(book.id);
  assert.equal(
    (
      await request(ownerClient, 'apply', {
        operationId: 'test-operation-0007',
        collection: 'coloring_pages',
        recordId: page.id,
        base: pageBaseline,
        patch: { status: 'in_progress' },
      })
    ).status,
    404,
    'deleting a book cascades its pages, including replay targets'
  );
  assert.equal(
    (
      await admin.collection('coloring_pages').getList(1, 10, {
        filter: `id = '${page.id}'`,
      })
    ).items.length,
    0
  );
  await admin.collection('projects').delete(project.id);
  await admin.collection('projects').delete(collisionProject.id);
  assert.equal((await request(ownerClient, 'apply', operation)).status, 404);
  await admin.collection('projects').delete(poisoned.id);
  const empty = await request(ownerClient, 'snapshot');
  assert.equal((await empty.json()).projects.length, 0);

  const statusBook = await ownerClient.collection('coloring_books').create({
    user: owner.id,
    title: 'Page status lifecycle',
    status: 'completed',
    total_pages: 2,
  });
  const statusPages = ownerClient.collection('coloring_pages');
  const [webPage, syncPage] = await statusPages.getFullList({
    filter: ownerClient.filter('book = {:book}', { book: statusBook.id }),
    sort: 'page_number',
  });
  assert.equal(webPage.status, 'not_started', 'book status does not complete its pages');
  const summary = async () => {
    const response = await fetch(
      `${url}/api/stats/coloring/summary?year=${accountDate.slice(0, 4)}`,
      { headers: { Authorization: ownerClient.authStore.token } }
    );
    assert.equal(response.status, 200);
    return (await response.json()).metrics.completedPagesThisYear;
  };
  assert.equal(await summary(), 0);
  const finished = await statusPages.update(webPage.id, { status: 'completed' });
  assert.equal(finished.completed_at, `${accountDate} 00:00:00.000Z`, 'web completion date');
  assert.equal(await summary(), 1, 'status-only completion appears in yearly Stats');

  const reopened = await statusPages.update(webPage.id, { status: 'in_progress' });
  assert.equal(reopened.completed_at, finished.completed_at, 'preserve the date on reopen');
  assert.equal(await summary(), 0, 'reopened pages drop out of yearly Stats');
  const historicalDate = '2025-03-09 00:00:00.000Z';
  await statusPages.update(webPage.id, { completed_at: historicalDate });
  await statusPages.update(webPage.id, { status: 'on_hold' });
  const recompleted = await statusPages.update(webPage.id, { status: 'completed' });
  assert.equal(recompleted.completed_at, historicalDate, 'keep an existing completion date');
  await statusPages.update(webPage.id, { status: 'in_progress' });
  const cleared = await statusPages.update(webPage.id, { status: 'completed', completed_at: '' });
  assert.equal(cleared.status, 'completed');
  assert.equal(cleared.completed_at, '', 'completing with an explicit clear removes the old date');

  const lifecycleBase = record =>
    Object.fromEntries(Object.keys(pageBaseline).map(key => [key, record[key]]));
  const pendingReopen = {
    operationId: 'test-operation-queued-reopen',
    collection: 'coloring_pages',
    recordId: syncPage.id,
    base: { ...lifecycleBase(syncPage), status: 'completed', completed_at: null },
    patch: { status: 'in_progress' },
  };
  const syncCompletion = await request(ownerClient, 'apply', {
    operationId: 'test-operation-page-complete',
    collection: 'coloring_pages',
    recordId: syncPage.id,
    base: lifecycleBase(syncPage),
    patch: { status: 'completed' },
  });
  assert.equal(syncCompletion.status, 200, await syncCompletion.clone().text());
  const syncedPage = (await syncCompletion.json()).record;
  assert.equal(syncedPage.completed_at, finished.completed_at);
  assert.ok(!Object.hasOwn(syncedPage, 'mobile_completion_date_generated'));
  const checkConflict = async (operation, message) => {
    const response = await request(ownerClient, 'apply', operation);
    assert.equal(response.status, 409, message);
    assert.equal((await response.json()).reason, 'field_conflict', message);
  };
  await checkConflict(
    { ...pendingReopen, patch: { status: 'in_progress', completed_at: '' } },
    'the queued operation cannot overwrite the generated date'
  );
  await checkConflict(
    { ...pendingReopen, base: { ...pendingReopen.base, started_at: historicalDate } },
    'the queued operation still checks the full lifecycle group'
  );
  const queuedReopen = await request(ownerClient, 'apply', pendingReopen);
  assert.equal(queuedReopen.status, 200, await queuedReopen.clone().text());
  const reopenedSyncPage = (await queuedReopen.json()).record;
  assert.equal(reopenedSyncPage.status, 'in_progress');
  assert.equal(reopenedSyncPage.completed_at, syncedPage.completed_at);

  // An explicit date equal to the account day has the same value as a generated date.
  await statusPages.update(webPage.id, { completed_at: finished.completed_at });
  await checkConflict(
    {
      ...pendingReopen,
      operationId: 'test-operation-explicit-date',
      recordId: webPage.id,
      base: { ...lifecycleBase(cleared), completed_at: null },
    },
    'a status-only patch conflicts with a concurrent explicit date, even for today'
  );

  await statusPages.update(syncPage.id, { status: 'completed', completed_at: '' });
  const clearedSyncPage = await statusPages.update(syncPage.id, { status: 'in_progress' });
  const secondCompletion = await request(ownerClient, 'apply', {
    operationId: 'test-operation-second-completion',
    collection: 'coloring_pages',
    recordId: syncPage.id,
    base: lifecycleBase(clearedSyncPage),
    patch: { status: 'completed' },
  });
  assert.equal(secondCompletion.status, 200, await secondCompletion.clone().text());
  const secondSyncedPage = (await secondCompletion.json()).record;
  await statusPages.update(syncPage.id, {
    completed_at: secondSyncedPage.completed_at,
    mobile_completion_date_generated: true,
  });
  await checkConflict(
    { ...pendingReopen, operationId: 'test-operation-after-date-edit' },
    'an explicit date edit clears the marker, even when it writes the same date'
  );
  const createdComplete = await statusPages.create({
    book: statusBook.id,
    page_number: 3,
    status: 'completed',
  });
  assert.equal(createdComplete.completed_at, finished.completed_at, 'create completed');
  await ownerClient.collection('coloring_books').delete(statusBook.id);

  const utcBook = await otherClient.collection('coloring_books').create({
    user: other.id,
    title: 'Default timezone completion',
    total_pages: 1,
  });
  assert.equal((await admin.collection('users').getOne(other.id)).timezone, '');
  const utcPages = otherClient.collection('coloring_pages');
  const utcPage = await utcPages.getFirstListItem(
    otherClient.filter('book = {:id}', { id: utcBook.id })
  );
  const utcDayBefore = new Date().toISOString().slice(0, 10);
  const utcCompletion = await utcPages.update(utcPage.id, { status: 'completed' });
  const utcDayAfter = new Date().toISOString().slice(0, 10);
  assert.ok(
    [utcDayBefore, utcDayAfter].some(day => utcCompletion.completed_at === `${day} 00:00:00.000Z`),
    'an account with no saved timezone gets the UTC completion day'
  );
  await otherClient.collection('coloring_books').delete(utcBook.id);

  const completionDate = '2026-01-02 12:00:00.000Z';
  const correctedDate = '2026-01-03 12:00:00.000Z';
  const lifecycleBook = await admin.collection('coloring_books').create({
    user: owner.id,
    title: 'Lifecycle book',
    total_pages: 2,
    status: 'in_progress',
    date_completed: completionDate,
  });
  const lifecycleProject = await admin.collection('projects').create({
    user: owner.id,
    title: 'Lifecycle project',
    kit_category: 'full',
    status: 'progress',
    date_completed: completionDate,
  });
  const lifecyclePage = await admin.collection('coloring_pages').create({
    book: lifecycleBook.id,
    page_number: 3,
    status: 'in_progress',
    completed_at: completionDate,
  });
  for (const [collection, created, dateField, active] of [
    ['projects', lifecycleProject, 'date_completed', 'progress'],
    ['coloring_books', lifecycleBook, 'date_completed', 'in_progress'],
    ['coloring_pages', lifecyclePage, 'completed_at', 'in_progress'],
  ]) {
    assert.equal(created.status, 'completed', `${collection}: new completion date on create`);
    const manual = await admin.collection(collection).update(created.id, { status: active });
    assert.equal(manual.status, active, `${collection}: status-only edit`);
    assert.equal(manual[dateField], completionDate, `${collection}: historical date retained`);
    const unchanged = await admin
      .collection(collection)
      .update(created.id, { [dateField]: completionDate });
    assert.equal(unchanged.status, active, `${collection}: same saved date`);
    const corrected = await admin
      .collection(collection)
      .update(created.id, { [dateField]: correctedDate });
    assert.equal(corrected.status, 'completed', `${collection}: corrected date`);
    const cleared = await admin.collection(collection).update(created.id, { [dateField]: '' });
    assert.equal(cleared.status, 'completed', `${collection}: clear date without changing status`);
    if (collection !== 'coloring_pages') {
      for (const status of ['archived', 'destashed']) {
        const exempt = await admin
          .collection(collection)
          .update(created.id, { status, [dateField]: completionDate });
        assert.equal(exempt.status, status, `${collection}: ${status} exemption`);
        await admin.collection(collection).update(created.id, { [dateField]: '' });
      }
    }
  }
  await admin.collection('coloring_books').delete(lifecycleBook.id);
  await admin.collection('projects').delete(lifecycleProject.id);
  console.log(
    'PocketBase lifecycle: project, book and page create/update dates, historical status and exemptions passed'
  );
  console.log(
    'PocketBase mobile sync: snapshot, ownership, merge, conflict, replay, and deletion passed'
  );
} finally {
  await new Promise(resolve => {
    if (server.exitCode !== null || server.signalCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
  rmSync(directory, { recursive: true, force: true });
}
