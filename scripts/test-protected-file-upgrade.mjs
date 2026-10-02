#!/usr/bin/env node

// End-to-end PocketBase upgrade check: existing records and files survive, and
// each protected URL obeys the owner collection View rule. Optional rotation
// checks revocation separately from authorization.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';
import {
  installPocketBase,
  POCKETBASE_BASELINE_VERSION,
  POCKETBASE_VERSION,
} from './install-pocketbase.mjs';
import { applyIndexInventory } from './validate-pocketbase-upgrade.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runRoot = path.join(root, '.tmp', 'protected-file-upgrade');
mkdirSync(runRoot, { recursive: true });
const runDir = mkdtempSync(path.join(runRoot, 'run-'));
const report = { fixture: 'PocketBase 0.40.1 prior schema to 0.40.4', runDir, checks: [] };
const recordCheck = (name, detail) => report.checks.push({ name, ...detail });
const dataDir = path.join(runDir, 'pb_data');
const migrationDir = path.join(runDir, 'migrations');
const emptyHooksDir = path.join(runDir, 'hooks');
mkdirSync(migrationDir);
mkdirSync(emptyHooksDir);
const password = 'protected-file-fixture-password';
const adminEmail = 'files-admin@localhost.test';
const rotationTokenDurationSeconds = 600;
const minimumRotationTokenRemainingSeconds = 60;
const rotationArg = process.argv.find(arg => arg.startsWith('--rotation-migration='));
const committedRotationFile = path.join(
  root,
  'pb_migrations/1790268636_rotate_users_file_token.js'
);
const rotationFile = rotationArg
  ? rotationArg.slice('--rotation-migration='.length)
  : existsSync(committedRotationFile)
    ? committedRotationFile
    : undefined;
const browserGate = process.argv.includes('--browser-gate');
if (browserGate && !rotationFile) throw new Error('--browser-gate requires --rotation-migration');
if (rotationFile && !existsSync(rotationFile))
  throw new Error(`Missing rotation migration: ${rotationFile}`);
const waitForSignal = async name => {
  const signalPath = path.join(runDir, name);
  for (let attempt = 0; attempt < 1800; attempt++) {
    if (existsSync(signalPath)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${signalPath}`);
};
const png = readFileSync(path.join(root, 'public/android-chrome-512x512.png'));
const pngDimensions = bytes => {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'valid PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
assert.deepEqual(pngDimensions(png), { width: 512, height: 512 });
const photo = () => new File([png], 'existing.png', { type: 'image/png' });
const replacement = name => new File([png], name, { type: 'image/png' });
const tokenExpirySeconds = token => {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(typeof payload.exp, 'number', 'file token has signed expiry');
  return payload.exp;
};
// Last committed schema before INT-1081; keep this fixture stable after merge.

const portServer = net.createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const url = `http://127.0.0.1:${port}`;
let server;
let stage = 'setup';
const log = message => console.log(`${stage}: ${message}`);
const run = (binary, args, logName) => {
  const result = spawnSync(binary, args, { cwd: runDir, encoding: 'utf8' });
  writeFileSync(path.join(runDir, logName), `${result.stdout || ''}\n${result.stderr || ''}`);
  assert.equal(result.status, 0, `${logName} failed; see ${runDir}`);
};
const start = async binary => {
  writeFileSync(path.join(runDir, `${stage}-serve.log`), '');
  server = spawn(
    binary,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${dataDir}`,
      `--hooksDir=${emptyHooksDir}`,
      `--migrationsDir=${migrationDir}`,
    ],
    { cwd: runDir, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  server.stderr.on('data', chunk => {
    try {
      writeFileSync(path.join(runDir, `${stage}-serve.log`), chunk, { flag: 'a' });
    } catch {}
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`PocketBase exited while starting ${stage}; see ${runDir}`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`PocketBase did not start ${stage}; see ${runDir}`);
};
const stop = async () => {
  if (!server || server.exitCode !== null) return;
  const current = server;
  current.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => current.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]);
  if (current.exitCode === null) current.kill('SIGKILL');
  server = undefined;
};
const login = async (identity, collection = 'users') => {
  const client = new PocketBase(url);
  client.autoCancellation(false);
  await client.collection(collection).authWithPassword(identity, password);
  return client;
};
const upload = (client, collection, data) =>
  client.collection(collection).create({ ...data, image: photo() });
const fileCases = [
  ['users', 'avatar'],
  ['projects', 'image'],
  ['progress_notes', 'image'],
  ['coloring_books', 'cover_image'],
  ['coloring_pages', 'photos'],
  ['coloring_page_progress_notes', 'image'],
  ['coloring_page_color_references', 'photos'],
];
const checkFiles = async (records, owner, ownerToken, otherToken, label) => {
  for (const [collection, field] of fileCases) {
    const record = records[collection];
    const filename = Array.isArray(record[field]) ? record[field][0] : record[field];
    assert.ok(filename, `${collection}.${field} has file`);
    const thumbnail = collection === 'projects' ? '300x200' : '100x100';
    for (const thumb of ['', thumbnail]) {
      const status = async token =>
        (
          await fetch(
            owner.files.getURL(record, filename, {
              thumb,
              ...(token === undefined ? {} : { token }),
            })
          )
        ).status;
      const ownerStatus = await status(ownerToken);
      const otherStatus = await status(otherToken);
      const missingStatus = await status(undefined);
      const malformedStatus = await status('malformed');
      const headerOnlyStatus = (
        await fetch(owner.files.getURL(record, filename, { thumb }), {
          headers: { Authorization: `Bearer ${owner.authStore.token}` },
        })
      ).status;
      assert.equal(ownerStatus, 200, `${label} ${collection}.${field} owner ${thumb}`);
      assert.equal(otherStatus, 404, `${label} ${collection}.${field} other ${thumb}`);
      assert.equal(missingStatus, 404, `${label} ${collection}.${field} no token ${thumb}`);
      assert.equal(malformedStatus, 404, `${label} ${collection}.${field} malformed ${thumb}`);
      assert.equal(
        headerOnlyStatus,
        404,
        `${label} ${collection}.${field} auth header only ${thumb}`
      );
      let dimensions;
      if (thumb) {
        const thumbnailBytes = Buffer.from(
          await (
            await fetch(owner.files.getURL(record, filename, { thumb, token: ownerToken }))
          ).arrayBuffer()
        );
        dimensions = pngDimensions(thumbnailBytes);
        assert.ok(
          dimensions.width < 512 && dimensions.height < 512,
          `${label} ${collection}.${field} is resized`
        );
        assert.notDeepEqual(
          thumbnailBytes,
          png,
          `${label} ${collection}.${field} thumbnail differs from original`
        );
      }
      recordCheck('file access', {
        stage: label,
        collection,
        field,
        variant: thumb || 'original',
        owner: ownerStatus,
        other: otherStatus,
        missing: missingStatus,
        malformed: malformedStatus,
        headerOnly: headerOnlyStatus,
        ...(dimensions ? { dimensions } : {}),
      });
    }
  }
};
try {
  const baseline = await installPocketBase({
    version: POCKETBASE_BASELINE_VERSION,
    destination: path.join(
      root,
      '.tmp/pocketbase-cache',
      POCKETBASE_BASELINE_VERSION,
      'pocketbase'
    ),
  });
  const current = await installPocketBase({
    destination: path.join(root, '.tmp/pocketbase-cache', POCKETBASE_VERSION, 'pocketbase'),
  });
  run(baseline, ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`], 'superuser.log');
  await start(baseline);
  let admin = await login(adminEmail, '_superusers');
  const priorSchema = JSON.parse(
    readFileSync(path.join(root, 'scripts/fixtures/protected-file-baseline.schema.json'), 'utf8')
  );
  const inventory = JSON.parse(
    readFileSync(path.join(root, 'scripts/fixtures/production-index-inventory.json'), 'utf8')
  );
  await admin.collections.import(applyIndexInventory(priorSchema, inventory), false);
  const ownerUser = await admin.collection('users').create({
    email: 'files-owner@localhost.test',
    username: 'files-owner',
    password,
    passwordConfirm: password,
    verified: true,
    avatar: photo(),
  });
  const otherUser = await admin.collection('users').create({
    email: 'files-other@localhost.test',
    username: 'files-other',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const project = await upload(admin, 'projects', {
    title: 'Existing project',
    user: ownerUser.id,
    status: 'progress',
    kit_category: 'full',
  });
  const progressNote = await upload(admin, 'progress_notes', {
    project: project.id,
    date: '2026-09-26',
  });
  const book = await admin.collection('coloring_books').create({
    title: 'Existing book',
    user: ownerUser.id,
    total_pages: 1,
    status: 'in_progress',
    cover_image: photo(),
  });
  const page = await admin
    .collection('coloring_pages')
    .create({ book: book.id, page_number: 1, status: 'in_progress', photos: photo() });
  const pageNote = await upload(admin, 'coloring_page_progress_notes', {
    user: ownerUser.id,
    page: page.id,
    date: '2026-09-26',
  });
  const reference = await admin
    .collection('coloring_page_color_references')
    .create({ user: ownerUser.id, page: page.id, photos: photo() });
  const records = {
    users: ownerUser,
    projects: project,
    progress_notes: progressNote,
    coloring_books: book,
    coloring_pages: page,
    coloring_page_progress_notes: pageNote,
    coloring_page_color_references: reference,
  };
  const originals = Object.fromEntries(
    fileCases.map(([collection, field]) => [collection, records[collection][field]])
  );
  const assertPreserved = async (label, token, client) => {
    const inspector = await login(adminEmail, '_superusers');
    for (const [collection, field] of fileCases) {
      const updated = await inspector.collection(collection).getOne(records[collection].id);
      assert.deepEqual(
        updated[field],
        originals[collection],
        `${label} ${collection}.${field} filename retained`
      );
      const filename = Array.isArray(updated[field]) ? updated[field][0] : updated[field];
      const bytes = Buffer.from(
        await (await fetch(client.files.getURL(updated, filename, { token }))).arrayBuffer()
      );
      assert.deepEqual(bytes, png, `${label} ${collection}.${field} bytes retained`);
      recordCheck('existing file preserved', {
        stage: label,
        collection,
        field,
        filename,
        byteLength: bytes.length,
      });
    }
  };
  let owner = await login(ownerUser.email);
  let other = await login(otherUser.email);
  const oldLoginToken = owner.authStore.token;
  const oldFileToken = await owner.files.getToken();
  const otherFileToken = await other.files.getToken();
  stage = 'before protection';
  const legacyURL = owner.files.getURL(project, project.image);
  assert.equal((await fetch(legacyURL)).status, 200);
  recordCheck('legacy URL before protection', { status: 200 });
  log('legacy tokenless file is available as expected');
  await stop();
  stage = 'six migrations';
  for (const name of [
    '1790268548_updated_users.js',
    '1790268597_updated_projects.js',
    '1790268631_updated_progress_notes.js',
    '1790268632_updated_coloring_books.js',
    '1790268634_updated_coloring_pages.js',
    '1790268635_updated_coloring_page_progress_notes.js',
  ])
    copyFileSync(path.join(root, 'pb_migrations', name), path.join(migrationDir, name));
  run(
    current,
    ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${migrationDir}`],
    'six-migrate.log'
  );
  await start(current);
  owner = await login(ownerUser.email);
  other = await login(otherUser.email);
  await checkFiles(records, owner, oldFileToken, otherFileToken, 'six');
  await assertPreserved('six migrations', oldFileToken, owner);
  const mutationProject = await owner.collection('projects').create({
    title: 'Post-upgrade upload',
    user: ownerUser.id,
    status: 'progress',
    kit_category: 'full',
  });
  const firstUpload = await owner
    .collection('projects')
    .update(mutationProject.id, { image: replacement('uploaded.png') });
  assert.equal(
    (await fetch(owner.files.getURL(firstUpload, firstUpload.image, { token: oldFileToken })))
      .status,
    200
  );
  const secondUpload = await owner
    .collection('projects')
    .update(mutationProject.id, { image: replacement('replaced.png') });
  assert.notEqual(secondUpload.image, firstUpload.image);
  assert.equal(
    (await fetch(owner.files.getURL(firstUpload, firstUpload.image, { token: oldFileToken })))
      .status,
    404
  );
  assert.equal(
    (await fetch(owner.files.getURL(secondUpload, secondUpload.image, { token: oldFileToken })))
      .status,
    200
  );
  const deletedImage = await owner
    .collection('projects')
    .update(mutationProject.id, { image: null });
  assert.equal(deletedImage.image, '');
  assert.equal(
    (await fetch(owner.files.getURL(secondUpload, secondUpload.image, { token: oldFileToken })))
      .status,
    404
  );
  recordCheck('upload replace delete', {
    upload: 200,
    replacedOld: 404,
    replacement: 200,
    deleted: 404,
  });
  log('seven file fields retain bytes; owners pass and all other/tokenless requests return 404');
  if (rotationFile) {
    if (browserGate) {
      writeFileSync(
        path.join(runDir, 'browser-gate.json'),
        JSON.stringify(
          { url, password, ownerEmail: ownerUser.email, otherEmail: otherUser.email, runDir },
          null,
          2
        )
      );
      console.log(`Browser gate ready: ${path.join(runDir, 'browser-gate.json')}`);
      await waitForSignal('rotate.ready');
    }
    const rotationAdmin = await login(adminEmail, '_superusers');
    const rotationUsers = await rotationAdmin.collections.getOne('users');
    await rotationAdmin.collections.update(rotationUsers.id, {
      fileToken: { ...rotationUsers.fileToken, duration: rotationTokenDurationSeconds },
    });
    owner = await login(ownerUser.email);
    const rotationToken = await owner.files.getToken();
    const rotationExpiry = tokenExpirySeconds(rotationToken);
    assert.ok(
      rotationExpiry - Date.now() / 1000 > minimumRotationTokenRemainingSeconds,
      'pre-rotation token has over a minute left'
    );
    assert.equal(
      (await fetch(owner.files.getURL(project, project.image, { token: rotationToken }))).status,
      200,
      'pre-rotation token accesses an existing protected file'
    );
    await stop();
    stage = 'rotation';
    copyFileSync(rotationFile, path.join(migrationDir, path.basename(rotationFile)));
    run(
      current,
      ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${migrationDir}`],
      'rotation-migrate.log'
    );
    await start(current);
    owner = await login(ownerUser.email);
    other = await login(otherUser.email);
    const freshFileToken = await owner.files.getToken();
    await checkFiles(
      records,
      owner,
      freshFileToken,
      await other.files.getToken(),
      'rotation fresh'
    );
    await assertPreserved('rotation', freshFileToken, owner);
    for (const [collection, field] of fileCases) {
      const record = records[collection];
      const filename = Array.isArray(record[field]) ? record[field][0] : record[field];
      for (const thumb of ['', collection === 'projects' ? '300x200' : '100x100'])
        assert.equal(
          (await fetch(owner.files.getURL(record, filename, { token: rotationToken, thumb })))
            .status,
          404,
          `${collection}.${field} old file token revoked`
        );
      recordCheck('old file token revoked', {
        collection,
        field,
        variants: ['original', collection === 'projects' ? '300x200' : '100x100'],
        status: 404,
      });
    }
    assert.ok(
      rotationExpiry - Date.now() / 1000 > minimumRotationTokenRemainingSeconds,
      'revoked file token has over a minute left'
    );
    recordCheck('unexpired file token revoked', {
      beforeRotation: 200,
      afterRotation: 404,
      fixtureDurationSeconds: rotationTokenDurationSeconds,
      remainingSeconds: Math.floor(rotationExpiry - Date.now() / 1000),
    });
    const oldSession = new PocketBase(url);
    oldSession.authStore.save(oldLoginToken, ownerUser);
    await oldSession.collection('users').authRefresh();
    assert.equal(oldSession.authStore.record.id, ownerUser.id);
    recordCheck('old login token refresh', { status: 200 });
    log('old file token revoked; existing login refreshes');
    if (browserGate) {
      writeFileSync(path.join(runDir, 'rotated.ready'), '');
      await waitForSignal('browser.done');
    }
  }
  if (!browserGate) {
    await stop();
    stage = 'native thumbs';
    const nativeThumbsFile = '1790500000_add_native_artwork_thumbs.js';
    copyFileSync(
      path.join(root, 'pb_migrations', nativeThumbsFile),
      path.join(migrationDir, nativeThumbsFile)
    );
    run(
      current,
      ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${migrationDir}`],
      'native-thumbs-migrate.log'
    );
    await start(current);
    owner = await login(ownerUser.email);
    other = await login(otherUser.email);
    const nativeOwnerToken = await owner.files.getToken();
    const nativeOtherToken = await other.files.getToken();
    for (const [collection, field] of fileCases.filter(
      ([name]) => !['users', 'coloring_page_color_references'].includes(name)
    )) {
      const record = records[collection];
      const filename = Array.isArray(record[field]) ? record[field][0] : record[field];
      for (const thumb of ['480x600f', '960x1200f']) {
        const response = await fetch(
          owner.files.getURL(record, filename, { thumb, token: nativeOwnerToken })
        );
        assert.equal(response.status, 200, `${collection}.${field} owner ${thumb}`);
        const dimensions = pngDimensions(Buffer.from(await response.arrayBuffer()));
        const [maxWidth, maxHeight] = thumb.slice(0, -1).split('x').map(Number);
        const expected = Math.min(512, maxWidth, maxHeight);
        assert.deepEqual(
          dimensions,
          { width: expected, height: expected },
          `${collection}.${field} ${thumb} fits without cropping`
        );
        assert.equal(
          (await fetch(owner.files.getURL(record, filename, { thumb, token: nativeOtherToken })))
            .status,
          404,
          `${collection}.${field} other ${thumb}`
        );
        recordCheck('native thumb', { collection, field, thumb, dimensions });
      }
    }
    log('native 4:5 thumbs fit the square fixture and stay private');
    const expiryAdmin = await login(adminEmail, '_superusers');
    const usersCollection = await expiryAdmin.collections.getOne('users');
    await expiryAdmin.collections.update(usersCollection.id, {
      fileToken: { ...usersCollection.fileToken, duration: 10 },
    });
    const expiryClient = await login(ownerUser.email);
    const expiringToken = await expiryClient.files.getToken();
    const imageURL = expiryClient.files.getURL(records.projects, records.projects.image, {
      token: expiringToken,
    });
    assert.equal((await fetch(imageURL)).status, 200, 'short-lived signed token starts valid');
    const expiresAt = tokenExpirySeconds(expiringToken) * 1000;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 300)));
    assert.ok(Date.now() > expiresAt, 'signed file token expiry has passed');
    assert.equal((await fetch(imageURL)).status, 404, 'expired signed file token denied');
    recordCheck('expired signed file token', {
      beforeExpiry: 200,
      status: 404,
      fixtureDurationSeconds: 10,
    });
    log('genuinely expired signed file token returns 404');
  }
  report.result = 'pass';
  writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PASS protected file upgrade; evidence: ${path.join(runDir, 'report.json')}`);
} catch (error) {
  report.result = 'fail';
  report.error = error instanceof Error ? error.message : String(error);
  if (error?.response) report.response = error.response;
  writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`FAIL protected file upgrade: ${error.stack || error}; evidence: ${runDir}`);
  process.exitCode = 1;
} finally {
  await stop();
}
