import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
cpSync(path.join(root, 'pb_hooks'), hooksDir, { recursive: true });
// Force delivery failure after recording the mail handoff, without contacting SMTP.
writeFileSync(
  path.join(hooksDir, 'test-mail.pb.js'),
  `onMailerSend(e => { console.log('COLOR_KEYS_MAIL:' + JSON.stringify({ to: e.message.to[0].address, text: e.message.text })); throw new Error('Controlled mail failure'); });\n`
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

writeFileSync(
  path.join(hooksDir, 'test-internal.pb.js'),
  `
routerAdd('GET', '/api/test/color-keys/barrier/{marker}', e => {
  console.log('COLOR_KEYS_BARRIER:' + e.request.pathValue('marker'));
  return e.noContent(204);
}, $apis.requireAuth('_superusers'));
routerAdd('POST', '/api/test/color-keys/internal', e => {
  const record = new Record(e.app.findCollectionByNameOrId('coloring_page_color_keys'));
  const body = e.requestInfo().body;
  for (const field of ['user', 'page', 'symbol', 'position', 'tried']) {
    if (Object.prototype.hasOwnProperty.call(body, field)) record.set(field, body[field]);
  }
  e.app.save(record);
  return e.json(200, record.publicExport());
}, $apis.requireAuth('_superusers'));
routerAdd('POST', '/api/test/color-keys/restore-placeholder', e => {
  const body = e.requestInfo().body;
  e.app.db().newQuery('UPDATE coloring_page_color_keys SET symbol = {:symbol} WHERE id = {:id}').bind({ id: body.id, symbol: body.symbol }).execute();
  return e.noContent(204);
}, $apis.requireAuth('_superusers'));
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
const password = 'color-keys-smoke-password-123';
const adminEmail = 'color-keys-admin@example.test';
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
    env: { ...process.env, FEEDBACK_TO_EMAIL: 'color-keys-maintainer@example.test' },
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
  const logLines = () =>
    output.split(/\r?\n/).map(line => line.replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} /, ''));
  let barrierId = 0;
  const flushOutput = async () => {
    const marker = String(++barrierId);
    await admin.send(`/api/test/color-keys/barrier/${marker}`, { method: 'GET' });
    const deadline = Date.now() + 3000;
    while (!logLines().includes(`COLOR_KEYS_BARRIER:${marker}`)) {
      if (Date.now() >= deadline) throw new Error('PocketBase stdout barrier did not arrive');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const mails = email =>
    logLines()
      .filter(line => line.startsWith('COLOR_KEYS_MAIL:'))
      .map(line => JSON.parse(line.slice('COLOR_KEYS_MAIL:'.length)))
      .filter(mail => mail.to === email);
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
      .getFirstListItem(`book = '${book.id}' && page_number = 1`);
    return { user, client, book, page };
  };
  const a = await account('owner');
  for (const path of ['batched', 'direct']) {
    const keyBook = await a.client.collection('coloring_books').create({
      title: `Color key reduction ${path}`,
      user: a.user.id,
      total_pages: 2,
      status: 'in_progress',
    });
    const keyPage = await a.client
      .collection('coloring_pages')
      .getFirstListItem(`book = '${keyBook.id}' && page_number = 2`);
    assert.equal(keyPage.status, 'not_started');
    const key = await a.client.collection('coloring_page_color_keys').create({
      user: a.user.id,
      page: keyPage.id,
      position: 0,
      symbol: 'u:0031',
      tried: [],
    });
    const reduction =
      path === 'direct'
        ? a.client.collection('coloring_books').update(keyBook.id, { total_pages: 1 })
        : a.client.send(`/api/coloring/books/${keyBook.id}/reduce-pages`, {
            method: 'POST',
            body: { targetTotalPages: 1 },
          });
    await assert.rejects(
      reduction,
      error =>
        error.status === 400 && error.response.data.total_pages.code === 'validation_worked_pages'
    );
    assert.equal((await a.client.collection('coloring_books').getOne(keyBook.id)).total_pages, 2);
    assert.equal((await a.client.collection('coloring_pages').getOne(keyPage.id)).id, keyPage.id);
    assert.equal(
      (await a.client.collection('coloring_page_color_keys').getOne(key.id)).symbol,
      'u:0031'
    );
    await admin.collection('coloring_books').delete(keyBook.id);
  }
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
  for (const same of [
    { user: a.user.id },
    { page: a.page.id },
    { user: a.user.id, page: a.page.id },
  ]) {
    assert.equal((await a.client.collection(keys).update(key.id, same)).id, key.id);
  }
  const sameOwnerPage = await a.client
    .collection('coloring_pages')
    .getFirstListItem(`book = '${a.book.id}' && page_number = 2`);
  for (const change of [{ user: b.user.id }, { page: b.page.id }, { page: sameOwnerPage.id }]) {
    await reject(a.client.collection(keys).update(key.id, change), 404);
  }
  for (const fields of [
    { symbol: 'u:abcd' },
    { symbol: 'r:short' },
    { symbol: 'c:UPPER' },
    { symbol: 'u:123' },
    { symbol: 'u:00041' },
    { symbol: 'u:D800' },
    { symbol: 'u:110000' },
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
  assert.deepEqual(
    (await a.client.collection(keys).getFullList()).map(row => row.id),
    [key.id]
  );
  assert.deepEqual((await a.client.collection(keys).update(key.id, { tried: null })).tried, []);
  const internal = await admin.send('/api/test/color-keys/internal', {
    method: 'POST',
    body: { user: a.user.id, page: a.page.id, symbol: 'u:0031' },
  });
  assert.equal(internal.position, 0);
  assert.deepEqual(internal.tried, []);
  for (const tried of [null, '']) {
    const defaulted = await admin.send('/api/test/color-keys/internal', {
      method: 'POST',
      body: { user: a.user.id, page: a.page.id, symbol: 'u:0031', position: 0, tried },
    });
    assert.deepEqual(defaulted.tried, []);
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
  for (const [label, fields] of [
    ['wrong MIME', { photo: new File(['plain text'], 'symbol.txt', { type: 'text/plain' }) }],
    [
      'over 10 MB',
      {
        photo: new File([png, new Uint8Array(10 * 1024 * 1024)], 'large.png', {
          type: 'image/png',
        }),
      },
    ],
    [
      'two files',
      {
        photo: [
          new File([png], 'one.png', { type: 'image/png' }),
          new File([png], 'two.png', { type: 'image/png' }),
        ],
      },
    ],
    ['missing photo', { photo: undefined }],
    ['missing email', { email: undefined }],
    ['invalid email', { email: 'not-an-email' }],
    ['missing book label', { book_label: undefined }],
    ['long book label', { book_label: 'x'.repeat(201) }],
    ['long description', { description: 'x'.repeat(501) }],
  ]) {
    await assert.rejects(
      admin.collection(requests).create(requestData(a, fields)),
      error =>
        error.status === 400 &&
        (label !== 'two files' ||
          error.message === 'A symbol request accepts exactly one photo.') &&
        (label !== 'missing photo' || error.response.data.photo?.code === 'validation_required'),
      label
    );
  }
  for (let n = 0; n < 6; n++) {
    const created = await admin
      .collection(requests)
      .create(requestData(a, { status: 'added', resolved_symbol: 'u:03C8' }));
    assert.equal(created.status, 'open');
    assert.equal(created.resolved_symbol, '');
  }
  await reject(b.client.collection(requests).create(requestData(a)), 400);
  await reject(unverified.client.collection(requests).create(requestData(unverified)), 400);
  await reject(a.client.collection(requests).create(requestData(a, { page: b.page.id })), 400);
  const draft = await admin
    .collection(requests)
    .create(requestData(a, { email: 'draft@example.test' }));
  for (const status of ['open', 'declined']) {
    await admin.collection(requests).update(draft.id, { status });
    await reject(admin.collection(requests).update(draft.id, { resolved_symbol: 'u:typo' }), 400);
    await admin.collection(requests).update(draft.id, { resolved_symbol: 'u:0041' });
    await admin.collection(requests).update(draft.id, { resolved_symbol: 'u:0042' });
    assert.equal(
      (await admin.collection(requests).update(draft.id, { resolved_symbol: '' })).resolved_symbol,
      ''
    );
  }
  await admin.collection(requests).update(draft.id, { status: 'added', resolved_symbol: 'u:0041' });
  await assert.rejects(
    admin.collection(requests).update(draft.id, { resolved_symbol: 'u:0042' }),
    error => error.status === 400 && error.message.includes('Resolved symbol cannot be changed')
  );
  const request = await a.client
    .collection(requests)
    .create(requestData(a, { status: 'invalid-client-status', resolved_symbol: 'x'.repeat(100) }));
  assert.equal(request.status, 'open');
  assert.equal(request.resolved_symbol, '');
  await flushOutput();
  assert.ok(
    mails('color-keys-maintainer@example.test').some(mail => mail.text.includes(request.id))
  );
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
  const unrelatedRequest = await admin.collection(requests).create(requestData(a));
  const unrelated = await a.client
    .collection(keys)
    .create(keyData(a, { symbol: `r:${unrelatedRequest.id}` }));
  const ordinary = await a.client.collection(keys).create(keyData(a, { symbol: 'u:0041' }));
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
  ownKeys.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  await a.client.collection(keys).update(ownKeys[1].id, { code: 'fail-resolution' });
  await assert.rejects(
    admin.collection(requests).update(request.id, { status: 'added', resolved_symbol: 'u:03C8' }),
    error => error.status === 400 && error.message.includes(ownKeys[1].id)
  );
  assert.equal((await admin.collection(requests).getOne(request.id)).status, 'declined');
  for (const item of ownKeys)
    assert.equal((await admin.collection(keys).getOne(item.id)).symbol, placeholder);
  await flushOutput();
  assert.equal(mails('owner@example.test').length, 0, 'Rolled-back resolution must not notify');
  await a.client.collection(keys).update(ownKeys[1].id, { code: '' });
  await admin
    .collection(requests)
    .update(request.id, { status: 'matched', resolved_symbol: 'c:linked-circles' });
  const resolved = await admin.collection(keys).getOne(ownKeys[0].id);
  for (const item of ownKeys)
    assert.equal((await admin.collection(keys).getOne(item.id)).symbol, 'c:linked-circles');
  assert.equal((await admin.collection(keys).getOne(foreign.id)).symbol, placeholder);
  assert.equal(
    (await admin.collection(keys).getOne(unrelated.id)).symbol,
    `r:${unrelatedRequest.id}`
  );
  assert.equal((await admin.collection(keys).getOne(ordinary.id)).symbol, 'u:0041');
  await flushOutput();
  assert.equal(mails('owner@example.test').length, 1);
  const mailCount = mails('owner@example.test').length;
  await admin
    .collection(requests)
    .update(request.id, { status: 'matched', resolved_symbol: 'c:linked-circles' });
  assert.equal((await admin.collection(keys).getOne(ownKeys[0].id)).updated, resolved.updated);
  await flushOutput();
  assert.equal(mails('owner@example.test').length, mailCount);
  await admin.collection(requests).update(request.id, { status: 'added' });
  await admin.collection(requests).update(request.id, { status: 'matched' });
  await flushOutput();
  assert.equal(
    mails('owner@example.test').length,
    mailCount,
    'Changes between resolved statuses do not notify'
  );
  for (const resolved_symbol of ['u:0042', '']) {
    await assert.rejects(
      admin.collection(requests).update(request.id, { resolved_symbol }),
      error =>
        error.status === 400 &&
        error.message.includes('Resolved symbol cannot be changed after resolution')
    );
  }
  for (const status of ['declined', 'open']) {
    await assert.rejects(
      admin.collection(requests).update(request.id, { status }),
      error =>
        error.status === 400 &&
        error.message.includes('A resolved request can only move between added and matched'),
      status
    );
  }
  assert.equal(
    (await admin.collection(requests).getOne(request.id)).resolved_symbol,
    'c:linked-circles'
  );
  assert.equal(
    (await a.client.collection(keys).create(keyData(a, { symbol: placeholder }))).symbol,
    'c:linked-circles'
  );
  assert.equal(
    (await a.client.collection(keys).update(ordinary.id, { symbol: placeholder })).symbol,
    'c:linked-circles'
  );
  assert.equal(
    (await b.client.collection(keys).update(foreign.id, { symbol: placeholder })).symbol,
    placeholder
  );
  const unresolved = await a.client
    .collection(keys)
    .create(keyData(a, { symbol: `r:${unrelatedRequest.id}` }));
  assert.equal(unresolved.symbol, `r:${unrelatedRequest.id}`);
  const unknown = await a.client
    .collection(keys)
    .create(keyData(a, { symbol: 'r:unknown00000000' }));
  assert.equal(unknown.symbol, 'r:unknown00000000');
  // Simulate an older stored placeholder to exercise rewrites without a status transition.
  await admin.send('/api/test/color-keys/restore-placeholder', {
    method: 'POST',
    body: { id: ordinary.id, symbol: placeholder },
  });
  await admin.collection(requests).update(request.id, { status: 'matched' });
  assert.equal((await admin.collection(keys).getOne(ordinary.id)).symbol, 'c:linked-circles');
  await flushOutput();
  assert.equal(mails('owner@example.test').length, mailCount + 1);
  const emptyRequest = await admin
    .collection(requests)
    .create(requestData(a, { email: 'empty@example.test' }));
  await admin
    .collection(requests)
    .update(emptyRequest.id, { status: 'added', resolved_symbol: 'u:0042' });
  await flushOutput();
  assert.equal(
    mails('empty@example.test').length,
    1,
    'Entering a resolved status notifies even without keys'
  );
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
  assert.equal(
    (await b.client.collection(keys).getFullList({ filter: `symbol = 'r:${addedRequest.id}'` }))
      .length,
    0
  );
  await flushOutput();
  assert.equal(mails('contact@example.test').length, 1);
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
