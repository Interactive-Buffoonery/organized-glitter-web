import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
mkdirSync(path.join(root, '.tmp'), { recursive: true });
const directory = mkdtempSync(path.join(root, '.tmp/color-keys-pb-'));
const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
const migrationsDir = path.join(directory, 'migrations');
mkdirSync(hooksDir);
mkdirSync(migrationsDir);
for (const file of ['color_keys.pb.js', 'color_keys.js'])
  copyFileSync(path.join(root, 'pb_hooks', file), path.join(hooksDir, file));
// Force delivery failure after recording the mail handoff, without contacting SMTP.
writeFileSync(
  path.join(hooksDir, 'test-mail.pb.js'),
  `onMailerSend(e => { console.log('COLOR_KEYS_MAIL:' + e.message.to[0].address); throw new Error('Controlled mail failure'); });\n`
);

writeFileSync(
  path.join(hooksDir, 'test-rollback.pb.js'),
  `
onRecordUpdate(e => {
  if (e.record.getString('code') === 'fail-resolution' && e.record.getString('symbol') !== e.record.original().getString('symbol')) throw new BadRequestError('Controlled propagation failure');
  e.next();
}, 'coloring_page_color_keys');
`
);

const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const password = 'feedback-smoke-password-123';
const adminEmail = 'feedback-admin@example.test';
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
  ],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEEDBACK_TO_EMAIL: 'feedback@example.test' },
  }
);
server.stdout.on('data', chunk => (output += chunk.toString()));
server.stderr.on('data', chunk => (output += chunk.toString()));

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
  await admin.collections.import(
    JSON.parse(readFileSync('docs/pocketbase/collections.schema.json', 'utf8')),
    false
  );
  const account = async name => {
    const user = await admin.collection('users').create({
      email: `${name}@example.test`,
      username: name,
      password,
      passwordConfirm: password,
      verified: true,
    });
    const client = new PocketBase(url);
    client.autoCancellation(false);
    await client.collection('users').authWithPassword(user.email, password);
    const book = await admin
      .collection('coloring_books')
      .create({ user: user.id, title: name, total_pages: 2, status: 'in_progress' });
    const page = await admin
      .collection('coloring_pages')
      .create({ book: book.id, page_number: 1, status: 'not_started' });
    return { user, client, book, page };
  };
  const a = await account('owner');
  const b = await account('other');
  const unverified = await account('unverified');
  await admin.collection('users').update(unverified.user.id, { verified: false });
  const keys = 'coloring_page_color_keys';
  const requests = 'coloring_symbol_requests';
  const reject = (promise, status) => assert.rejects(promise, error => error.status === status);
  const keyData = (who, extra = {}) => ({
    user: who.user.id,
    page: who.page.id,
    position: 0,
    symbol: 'u:0031',
    tried: [],
    ...extra,
  });
  const key = await a.client.collection(keys).create(keyData(a));
  assert.equal(key.position, 0);
  const removable = await a.client.collection(keys).create(keyData(a));
  await a.client.collection(keys).delete(removable.id);
  await reject(admin.collection(keys).getOne(removable.id), 404);
  const inconsistent = await admin.collection(keys).create(keyData(b, { page: a.page.id }));
  await reject(a.client.collection(keys).getOne(inconsistent.id), 404);
  await reject(b.client.collection(keys).getOne(inconsistent.id), 404);
  await a.client
    .collection(keys)
    .update(key.id, { code: '654', tried: ['a', 'b'], swatch: '#Aa09FF' });
  assert.equal((await a.client.collection(keys).getOne(key.id)).code, '654');
  for (const client of [b.client, unverified.client, new PocketBase(url)]) {
    assert.equal((await client.collection(keys).getList()).items.length, 0);
    await reject(client.collection(keys).getOne(key.id), 404);
    await reject(client.collection(keys).update(key.id, { code: 'stolen' }), 404);
    await reject(client.collection(keys).delete(key.id), 404);
  }
  await reject(b.client.collection(keys).create(keyData(a)), 400);
  await reject(a.client.collection(keys).create(keyData(a, { page: b.page.id })), 400);
  await reject(unverified.client.collection(keys).create(keyData(unverified)), 400);
  for (const change of [
    { user: a.user.id },
    { user: b.user.id },
    { page: a.page.id },
    { page: b.page.id },
  ]) {
    await reject(a.client.collection(keys).update(key.id, change), 404);
  }
  for (const fields of [
    { symbol: 'u:abcd' },
    { symbol: 'r:short' },
    { symbol: 'c:UPPER' },
    { symbol: 'u:123' },
    { tried: null },
    { tried: {} },
    { tried: [1] },
    { tried: Array(21).fill('a') },
    { tried: ['a'.repeat(101)] },
    { swatch: '#abc' },
    { swatch: 'red' },
    { code: 'x'.repeat(101) },
    { color_name: 'x'.repeat(101) },
    { note: 'x'.repeat(2001) },
    { position: -1 },
    { position: 0.5 },
  ]) {
    await reject(a.client.collection(keys).create(keyData(a, fields)), 400);
    await reject(a.client.collection(keys).update(key.id, fields), 400);
  }
  const absentPosition = keyData(a);
  delete absentPosition.position;
  await reject(a.client.collection(keys).create(absentPosition), 400);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  );
  const requestData = (who, extra = {}) => ({
    user: who.user.id,
    page: who.page.id,
    book_label: 'Book page 1',
    description: 'Two stacked letters',
    email: who.user.email,
    photo: new File([png], 'symbol.png', { type: 'image/png' }),
    ...extra,
  });
  await reject(b.client.collection(requests).create(requestData(a)), 400);
  await reject(unverified.client.collection(requests).create(requestData(unverified)), 400);
  await reject(a.client.collection(requests).create(requestData(a, { page: b.page.id })), 400);
  const request = await a.client
    .collection(requests)
    .create(requestData(a, { status: 'invalid-client-status', resolved_symbol: 'x'.repeat(100) }));
  assert.equal(request.status, 'open');
  assert.equal(request.resolved_symbol, '');
  assert.match(output, /COLOR_KEYS_MAIL:feedback@example.test/);
  assert.equal((await a.client.collection(requests).getOne(request.id)).id, request.id);
  for (const client of [b.client, unverified.client]) {
    assert.equal((await client.collection(requests).getList()).items.length, 0);
    await reject(client.collection(requests).getOne(request.id), 404);
  }
  await reject(a.client.collection(requests).update(request.id, { status: 'added' }), 403);
  await reject(a.client.collection(requests).delete(request.id), 403);
  const fileUrl = admin.files.getURL(request, request.photo);
  assert.equal((await fetch(fileUrl)).status, 404);
  const token = await a.client.files.getToken();
  assert.equal((await fetch(`${fileUrl}?token=${token}`)).status, 200);
  const otherToken = await b.client.files.getToken();
  assert.equal((await fetch(`${fileUrl}?token=${otherToken}`)).status, 404);
  const placeholder = `r:${request.id}`;
  const ownKeys = await Promise.all(
    [0, 1].map(position =>
      a.client.collection(keys).create(keyData(a, { symbol: placeholder, position }))
    )
  );
  const foreign = await b.client.collection(keys).create(keyData(b, { symbol: placeholder }));
  await reject(
    admin
      .collection(requests)
      .update(request.id, { status: 'added', resolved_symbol: placeholder }),
    400
  );
  await admin.collection(requests).update(request.id, { status: 'declined' });
  assert.equal((await admin.collection(keys).getOne(ownKeys[0].id)).symbol, placeholder);
  ownKeys.sort((left, right) => left.id.localeCompare(right.id));
  await a.client.collection(keys).update(ownKeys[1].id, { code: 'fail-resolution' });
  await reject(
    admin.collection(requests).update(request.id, { status: 'added', resolved_symbol: 'u:03C8' }),
    400
  );
  assert.equal((await admin.collection(requests).getOne(request.id)).status, 'declined');
  for (const item of ownKeys)
    assert.equal((await admin.collection(keys).getOne(item.id)).symbol, placeholder);
  assert.ok(
    !output.includes('COLOR_KEYS_MAIL:owner@example.test'),
    'Rolled-back resolution must not notify'
  );
  await a.client.collection(keys).update(ownKeys[1].id, { code: '' });
  await admin
    .collection(requests)
    .update(request.id, { status: 'matched', resolved_symbol: 'c:linked-circles' });
  const resolved = await admin.collection(keys).getOne(ownKeys[0].id);
  for (const item of ownKeys)
    assert.equal((await admin.collection(keys).getOne(item.id)).symbol, 'c:linked-circles');
  assert.equal((await admin.collection(keys).getOne(foreign.id)).symbol, placeholder);
  assert.match(output, /COLOR_KEYS_MAIL:owner@example.test/);
  const mailCount = output.split('COLOR_KEYS_MAIL:owner@example.test').length;
  await admin
    .collection(requests)
    .update(request.id, { status: 'matched', resolved_symbol: 'c:linked-circles' });
  assert.equal((await admin.collection(keys).getOne(ownKeys[0].id)).updated, resolved.updated);
  assert.equal(output.split('COLOR_KEYS_MAIL:owner@example.test').length, mailCount);
  const addedRequest = await b.client
    .collection(requests)
    .create(requestData(b, { email: 'contact@example.test' }));
  const batchKeys = [];
  for (let n = 0; n < 205; n++)
    batchKeys.push(
      await b.client
        .collection(keys)
        .create(keyData(b, { symbol: `r:${addedRequest.id}`, position: n }))
    );
  await admin
    .collection(requests)
    .update(addedRequest.id, { status: 'added', resolved_symbol: 'u:03C8' });
  const batchRows = await b.client.collection(keys).getFullList({ filter: "symbol = 'u:03C8'" });
  assert.equal(batchRows.length, batchKeys.length, 'Propagation traverses more than one batch');
  assert.match(output, /COLOR_KEYS_MAIL:contact@example.test/);
  // A fresh account proves the quota exactly, independent of invalid submissions above.
  const quota = await account('quota');
  const results = await Promise.all(
    Array.from({ length: 8 }, async () => {
      try {
        await quota.client.collection(requests).create(requestData(quota, { page: '' }));
        return 200;
      } catch (error) {
        return error.status;
      }
    })
  );
  assert.equal(results.filter(status => status === 200).length, 5, JSON.stringify(results));
  assert.equal(results.filter(status => status === 429).length, 3, JSON.stringify(results));
  await admin.collection('coloring_pages').delete(a.page.id);
  await reject(admin.collection(keys).getOne(key.id), 404);
  assert.equal((await admin.collection(requests).getOne(request.id)).page, '');
  await admin.collection('users').delete(a.user.id);
  await reject(admin.collection(requests).getOne(request.id), 404);
  await admin.collection('users').delete(b.user.id);
  await reject(admin.collection(keys).getOne(foreign.id), 404);
  console.log(
    'Color keys: ownership, verification, validation, immutability, protected files, status forcing, quota, nonfatal mail, resolution, idempotence and cascades passed'
  );
  if (process.argv.includes('--generate-types')) {
    const result = spawnSync('pnpm', ['pb:types'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        POCKETBASE_URL: url,
        POCKETBASE_ADMIN_EMAIL: adminEmail,
        POCKETBASE_ADMIN_PASSWORD: password,
      },
    });
    assert.equal(result.status, 0);
  }
} finally {
  await new Promise(resolve => {
    if (server.exitCode !== null || server.signalCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
}
