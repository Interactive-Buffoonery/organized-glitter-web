import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import PocketBase from 'pocketbase';

import { seedExampleLibrary, assertLocalExampleTarget } from './seed-example-library.mjs';

import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), 'og-example-library-pb-'));
const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
const migrationsDir = path.join(directory, 'migrations');
mkdirSync(hooksDir);
mkdirSync(migrationsDir);
for (const file of readdirSync(path.join(root, 'pb_hooks')).filter(file => file.endsWith('.js'))) {
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
const password = 'example-library-local-password-123';
const adminEmail = 'library-admin@example.test';
const setup = spawnSync(binary, ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`], {
  encoding: 'utf8',
});
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
    '--automigrate=false',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);
server.stdout.on('data', chunk => (output += chunk.toString()));
server.stderr.on('data', chunk => (output += chunk.toString()));

async function waitForPocketBase(admin) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`PocketBase stopped: ${output}`);
    try {
      await admin.health.check();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  throw new Error(`PocketBase did not become ready: ${output}`);
}

try {
  for (const target of [
    'https://data.organizedglitter.app',
    'http://localhost.evil.test:8090',
    'http://user:pass@localhost:8090',
  ]) {
    assert.throws(() => assertLocalExampleTarget(target));
  }
  const admin = new PocketBase(url);
  await waitForPocketBase(admin);
  await admin.collection('_superusers').authWithPassword(adminEmail, password);
  await admin.collections.import(
    JSON.parse(readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')),
    false
  );
  const user = await admin.collection('users').create({
    email: 'example-local@example.test',
    username: 'example-local',
    password,
    passwordConfirm: password,
    verified: true,
  });
  assert.deepEqual(await seedExampleLibrary(admin, user.id), { projects: 6, books: 4 });
  assert.deepEqual(await seedExampleLibrary(admin, user.id), { projects: 6, books: 4 });
  const projects = await admin.collection('projects').getFullList();
  const books = await admin.collection('coloring_books').getFullList();
  const pages = await admin.collection('coloring_pages').getFullList();
  assert.equal(projects.length, 6);
  assert.equal(books.length, 4);
  assert.equal(pages.length, 29);
  assert.equal(pages.filter(page => page.photos.length > 0).length, 11);
  assert.ok(
    pages.every(page => page.photos.length <= 1),
    'Repeated seed must not append duplicate page photos.'
  );
  assert.ok(projects.every(project => project.image && project.user === user.id));
  assert.ok(books.every(book => book.cover_image && book.user === user.id));
  const other = await admin.collection('users').create({
    email: 'other-example-local@example.test',
    username: 'other-example-local',
    password,
    passwordConfirm: password,
    verified: true,
  });
  assert.equal(user.analytics_opt_out, false, 'New accounts default to analytics enabled');
  const owner = new PocketBase(url);
  await owner.collection('users').authWithPassword(user.email, password);
  const optedOut = await owner.collection('users').update(user.id, { analytics_opt_out: true });
  assert.equal(optedOut.analytics_opt_out, true);
  const secondDevice = new PocketBase(url);
  await secondDevice.collection('users').authWithPassword(user.email, password);
  assert.equal(secondDevice.authStore.record.analytics_opt_out, true);
  const otherAccount = new PocketBase(url);
  await otherAccount.collection('users').authWithPassword(other.email, password);
  await assert.rejects(
    otherAccount.collection('users').update(user.id, { analytics_opt_out: false }),
    error => error.status === 404 || error.status === 403
  );
  await owner.collection('users').update(user.id, { analytics_opt_out: false });
  const refreshed = await secondDevice.collection('users').authRefresh();
  assert.equal(refreshed.record.analytics_opt_out, false);
  console.log(
    'Account analytics preference: default, save, second-device refresh and ownership checks passed.'
  );
  await assert.rejects(seedExampleLibrary(admin, other.id), /another local user/);
  console.log(
    'Local PocketBase example library: six projects, four books, 29 pages, eleven page images; repeat seeding and ownership checks passed.'
  );
} finally {
  const exited = new Promise(resolve => server.once('exit', resolve));
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await exited;
  }
  rmSync(directory, { recursive: true, force: true });
}
