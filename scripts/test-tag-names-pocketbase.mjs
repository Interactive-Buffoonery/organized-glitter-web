import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
mkdirSync(path.join(root, '.tmp'), { recursive: true });
const directory = mkdtempSync(path.join(root, '.tmp/tag-names-pb-'));
const hooksSource = process.env.TAG_NAMES_HOOKS_DIR || path.join(root, 'pb_hooks');
const password = 'tag-names-password-123';
const adminEmail = 'tag-names-admin@example.test';
const schema = JSON.parse(readFileSync('docs/pocketbase/collections.schema.json', 'utf8'));
const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});

const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
mkdirSync(path.join(directory, 'migrations'), { recursive: true });
cpSync(hooksSource, hooksDir, { recursive: true });
const setup = spawnSync(binary, ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`], {
  encoding: 'utf8',
});
assert.equal(setup.status, 0, setup.stderr);

const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
let output = '';
const server = spawn(
  binary,
  [
    'serve',
    `--http=127.0.0.1:${port}`,
    `--dir=${dataDir}`,
    `--hooksDir=${hooksDir}`,
    `--migrationsDir=${path.join(directory, 'migrations')}`,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);
server.stdout.on('data', chunk => (output += chunk.toString()));
server.stderr.on('data', chunk => (output += chunk.toString()));
const url = `http://127.0.0.1:${port}`;

const rejectsDuplicate = (promise, existing) =>
  assert.rejects(promise, error => {
    assert.equal(error.status, 400);
    assert.equal(error.response.message, `A tag named "${existing}" already exists.`);
    assert.equal(error.response.data.name.code, 'validation_not_unique');
    return true;
  });

try {
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
  const owner = await account('tagowner');
  const other = await account('tagother');

  for (const collection of ['tags', 'coloring_tags']) {
    const tags = owner.client.collection(collection);
    const tag = (name, user = owner.user.id) => ({
      user,
      name,
      slug: name.toLowerCase(),
      color: '#14b8a6',
    });
    const cats = await tags.create(tag('cats'));

    await rejectsDuplicate(tags.create(tag('CATS')), 'cats');
    await rejectsDuplicate(tags.create(tag('  Cats  ')), 'cats');

    const dogs = await tags.create(tag('dogs'));
    await rejectsDuplicate(tags.update(dogs.id, { name: ' CaTs' }), 'cats');
    assert.equal((await tags.update(cats.id, { name: 'Cats' })).name, 'Cats');
    assert.equal((await tags.update(dogs.id, { name: 'birds' })).name, 'birds');

    await other.client.collection(collection).create(tag('CATS', other.user.id));

    // Existing case duplicates stay untouched and editable.
    const legacy = await admin.collection(collection).create(tag('BIRDS'));
    assert.equal((await tags.update(legacy.id, { color: '#ff0000' })).color, '#ff0000');
    assert.equal((await tags.update(legacy.id, { name: 'Birds' })).name, 'Birds');

    console.log(`${collection}: case-insensitive tag names enforced`);
  }
} finally {
  if (server.exitCode === null) {
    await new Promise(resolve => {
      server.once('exit', resolve);
      server.kill('SIGTERM');
    });
  }
}
