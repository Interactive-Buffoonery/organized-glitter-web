#!/usr/bin/env node

// Real SQLite transactions and a loopback-only vendor exercise the crash windows
// that a mocked record store cannot verify. No vendor credentials are read.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startAppleFixture } from './test-support/apple/fixture.mjs';

mkdirSync('.tmp', { recursive: true });
const runDir = mkdtempSync(path.resolve('.tmp/posthog-erasure-'));
const hook = path.join(runDir, 'zz_posthog_test.pb.js');
writeFileSync(
  hook,
  `onBootstrap(e => { e.next(); cronRemove('account_deletion_posthog'); });
routerAdd('POST', '/api/test/posthog/run', e => {
  const worker = require(__hooks + '/account_deletion_posthog.js');
  const config = e.requestInfo().body.configured === false ? undefined : {
    host: $os.getenv('TEST_POSTHOG_URL'), projectId: '123', apiKey: 'disposable-key'
  };
  return e.json(200, worker.processPending(e.app, config));
}, $apis.requireSuperuserAuth());`
);
let handler = () => ({ status: 500, body: {} });
const requests = [];
const server = createServer(async (req, res) => {
  requests.push({ method: req.method, url: req.url });
  try {
    const reply = await handler(req);
    res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json', ...reply.headers });
    res.end(JSON.stringify(reply.body ?? {}));
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const host = `http://127.0.0.1:${server.address().port}`;
let fixture;
let db;
try {
  fixture = await startAppleFixture({
    extraHooks: [hook],
    testEnv: { TEST_POSTHOG_URL: host },
  });
  const request = async (route, body, method = 'POST', token = admin) => {
    const result = await fetch(fixture.baseUrl + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify(body),
    });
    return { status: result.status, body: await result.json().catch(() => null) };
  };
  let admin = '';
  admin = (
    await request('/api/collections/_superusers/auth-with-password', {
      identity: fixture.adminEmail,
      password: fixture.adminPassword,
    })
  ).body.token;
  assert.equal(
    (
      await request(
        '/api/collections/import',
        {
          collections: JSON.parse(readFileSync('docs/pocketbase/collections.schema.json')),
          deleteMissing: false,
        },
        'PUT'
      )
    ).status,
    204
  );
  db = new DatabaseSync(path.join(fixture.dataDir, 'data.db'));
  const now = () => new Date().toISOString();
  const row = id => db.prepare('SELECT * FROM account_deletion_jobs WHERE id = ?').get(id);
  const due = id =>
    db
      .prepare("UPDATE account_deletion_jobs SET next_attempt = '', lease_until = '' WHERE id = ?")
      .run(id);
  const create = async () => {
    db.exec("UPDATE account_deletion_jobs SET next_attempt = '2099-01-01 00:00:00.000Z'");
    const result = await request('/api/collections/account_deletion_jobs/records', {
      user_id: `test${Math.random().toString(36).slice(2)}`,
      source_kind: 'legacy',
      posthog_status: 'pending',
    });
    assert.equal(result.status, 200);
    return result.body.id;
  };
  const run = async (configured = true) => {
    const result = await request('/api/test/posthog/run', { configured });
    assert.equal(result.status, 200);
    return result.body;
  };
  const uuid = '095be615-a8ad-4c33-8e9c-c7612fbf6c9f';
  let id = await create();
  await run(false);
  assert.equal(row(id).posthog_status, 'blocked');
  assert.equal(row(id).last_error, 'configuration');
  assert.ok(row(id).alerted_at);
  assert.equal(requests.length, 0, 'missing configuration never contacts vendor');

  id = await create();
  handler = () => ({ body: { results: [], next: null } });
  await run();
  assert.equal(row(id).posthog_status, 'blocked', 'missing person is ambiguous, not complete');
  assert.equal(row(id).last_error, 'identity_missing');
  assert.ok(row(id).next_attempt);
  const alerted = row(id).alerted_at;
  due(id);
  await run();
  assert.equal(row(id).alerted_at, alerted, 'alerts are rate limited durably');

  id = await create();
  handler = () => ({ status: 429, headers: { 'Retry-After': '7200' } });
  const before = Date.now();
  await run();
  assert.ok(Date.parse(row(id).next_attempt) >= before + 7199_000, '429 respects Retry-After');
  const count = requests.length;
  await run();
  assert.equal(requests.length, count, 'backoff survives worker invocation');

  id = await create();
  handler = () => ({
    body: {
      results: [{ id: uuid, distinct_ids: [row(id).user_id] }],
      next: 'https://untrusted.invalid/page',
    },
  });
  await run();
  assert.equal(row(id).posthog_status, 'blocked', 'ambiguous pagination fails closed');
  assert.ok(!requests.some(r => r.url.includes('untrusted')));

  // The stored target must exist before the vendor accepts deletion. Force the
  // post-response write to fail, then prove recovery verifies the same UUID.
  id = await create();
  const identities = [
    row(id).user_id,
    ...Array.from({ length: 30 }, (_, n) => `linked-anonymous-device-${n}`),
  ];
  let deletes = 0;
  let durableBeforeDelete = false;
  let verification = 'pending';
  handler = req => {
    if (req.method === 'DELETE') {
      const url = new URL(req.url, host);
      assert.equal(url.searchParams.get('delete_events'), 'true');
      assert.equal(url.searchParams.get('delete_recordings'), 'true');
      deletes++;
      const current = row(id);
      const target = JSON.parse(current.posthog_target);
      durableBeforeDelete =
        target.personId === uuid &&
        JSON.stringify(target.distinctIds) === JSON.stringify(identities) &&
        !!current.posthog_requested_at;
      db.exec(
        "CREATE TRIGGER fail_worker_save BEFORE UPDATE ON account_deletion_jobs BEGIN SELECT RAISE(ABORT, 'disposable crash window'); END;"
      );
      return { status: 202 };
    }
    if (req.url.includes('deletion_status')) {
      return {
        body: {
          results: [
            {
              person_uuid: uuid,
              status: verification,
              created_at: row(id).posthog_requested_at,
              delete_verified_at: verification === 'completed' ? now() : null,
            },
          ],
          next: null,
        },
      };
    }
    if (req.url.includes(`/${uuid}/`)) return { body: { uuid, distinct_ids: identities } };
    return { body: { results: [{ id: uuid, distinct_ids: identities.slice(0, 10) }], next: null } };
  };
  await run();
  assert.ok(
    durableBeforeDelete,
    'target and all linked identities persisted before irreversible request'
  );
  assert.equal(row(id).posthog_status, 'requested');
  assert.ok(row(id).lease_token, 'failed final write leaves recoverable lease');
  assert.equal(deletes, 1);
  db.exec('DROP TRIGGER fail_worker_save');
  await run();
  assert.equal(deletes, 1, 'active lease prevents another request');
  due(id);
  await run();
  assert.equal(row(id).posthog_status, 'requested', 'pending verification remains pending');
  assert.equal(deletes, 1, 'recovering request verifies instead of blindly repeating delete');
  due(id);
  handler = () => ({
    body: {
      results: [{ person_uuid: uuid, status: 'completed', delete_verified_at: null }],
      next: null,
    },
  });
  await run();
  assert.notEqual(row(id).posthog_status, 'completed', 'status alone is not verification');
  due(id);
  handler = () => ({
    body: {
      results: [
        {
          person_uuid: uuid,
          status: 'completed',
          created_at: row(id).posthog_requested_at,
          delete_verified_at: now(),
        },
      ],
      next: null,
    },
  });
  await run();
  assert.equal(row(id).posthog_status, 'completed');
  assert.ok(row(id).posthog_verified_at);
  assert.equal(row(id).posthog_target, null, 'vendor identities cleared after verification');

  // Lost acceptance followed by an absent person must preserve the same target.
  id = await create();
  const lostTarget = { host, projectId: '123', personId: uuid, distinctIds: [row(id).user_id] };
  db.prepare(
    "UPDATE account_deletion_jobs SET posthog_status = 'requested', posthog_target = ?, posthog_requested_at = ? WHERE id = ?"
  ).run(JSON.stringify(lostTarget), now(), id);
  handler = req =>
    req.method === 'DELETE' ? { status: 404 } : { body: { results: [], next: null } };
  await run();
  assert.equal(row(id).posthog_status, 'blocked');
  assert.equal(row(id).last_error, 'deletion_unconfirmed');
  assert.deepEqual(JSON.parse(row(id).posthog_target), lostTarget);
  due(id);
  handler = () => ({
    body: {
      results: [
        {
          person_uuid: uuid,
          status: 'completed',
          created_at: '2000-01-01T00:00:00Z',
          delete_verified_at: now(),
        },
      ],
      next: null,
    },
  });
  await run();
  assert.notEqual(
    row(id).posthog_status,
    'completed',
    'old deletion evidence cannot certify this request'
  );

  // A second claimant owns this row while the first HTTP call is in flight.
  id = await create();
  handler = req => {
    db.prepare(
      "UPDATE account_deletion_jobs SET lease_token = 'new-owner', lease_until = '2099-01-01 00:00:00.000Z' WHERE id = ?"
    ).run(id);
    return {
      body: req.url.includes(`/${uuid}/`)
        ? { uuid, distinct_ids: [row(id).user_id] }
        : { results: [{ id: uuid }], next: null },
    };
  };
  const priorDeletes = requests.filter(r => r.method === 'DELETE').length;
  await run();
  assert.equal(row(id).lease_token, 'new-owner');
  assert.equal(row(id).posthog_status, 'pending');
  assert.equal(
    requests.filter(r => r.method === 'DELETE').length,
    priorDeletes,
    'stale claimant cannot submit or overwrite'
  );

  id = await create();
  db.prepare(
    "UPDATE account_deletion_jobs SET posthog_status = 'requested', posthog_target = ?, posthog_requested_at = ? WHERE id = ?"
  ).run(
    JSON.stringify({
      host: 'https://eu.posthog.com',
      projectId: '999',
      personId: uuid,
      distinctIds: [row(id).user_id],
    }),
    now(),
    id
  );
  const priorRequests = requests.length;
  await run();
  assert.equal(row(id).posthog_status, 'blocked');
  assert.equal(row(id).last_error, 'target_configuration');
  assert.equal(requests.length, priorRequests, 'config changes cannot redirect a durable target');

  id = await create();
  handler = () => ({ status: 401, body: { detail: 'sensitive vendor response' } });
  await run();
  assert.equal(row(id).posthog_status, 'blocked');
  assert.equal(row(id).last_error, 'authorization');
  const log = readFileSync(fixture.logPath, 'utf8');
  assert.ok(!log.includes('sensitive vendor response'));
  assert.ok(!log.includes('linked-anonymous-device'));
  db.exec("UPDATE account_deletion_jobs SET next_attempt = '2099-01-01 00:00:00.000Z'");
  const batch = [];
  for (let index = 0; index < 12; index++) {
    const result = await request('/api/collections/account_deletion_jobs/records', {
      user_id: `batch${index}`,
      source_kind: 'legacy',
      posthog_status: 'pending',
    });
    assert.equal(result.status, 200);
    batch.push(result.body.id);
  }
  handler = () => ({ status: 503 });
  assert.equal((await run()).attempted, 10, 'cron work is bounded');
  assert.equal(batch.filter(jobId => row(jobId).attempts === 1).length, 10);
  console.log(
    'PostHog worker: fail closed config, durable target, backoff, crash recovery, verification, and stale claims passed.'
  );
  console.log(`Private fixture artifacts: ${runDir}`);
} finally {
  db?.close();
  await fixture?.close();
  await new Promise(resolve => server.close(resolve));
}
