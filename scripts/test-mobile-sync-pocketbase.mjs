import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), 'og-mobile-sync-'));
const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
mkdirSync(hooksDir);
for (const file of readdirSync(path.join(root, 'pb_hooks')).filter(name =>
  name.endsWith('.js')
)) {
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
  { stdio: ['ignore', 'pipe', 'pipe'] }
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
  assert.equal((await admin.collection('projects').getOne(collisionProject.id)).title, 'Collision handled');
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
  });
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
  assert.equal(updatedPage.completed_at, page.completed_at, 'status-only sync preserves completed_at');
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
