#!/usr/bin/env node

// Real SQLite transactions and a loopback-only vendor exercise the crash windows
// that a mocked record store cannot verify. No vendor credentials are read.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { testErasureConfiguration } from './test-support/account-deletion-config.mjs';
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
}, $apis.requireSuperuserAuth());
routerAdd('POST', '/api/test/posthog/plans', e => {
  const queries = require(__hooks + '/account_deletion_posthog.js').queries;
  const output = {};
  for (const name of ['claim', 'alerts']) {
    const rows = arrayOf(new DynamicModel({ id: 0, parent: 0, notused: 0, detail: '' }));
    e.app.db().newQuery('EXPLAIN QUERY PLAN ' + queries[name]).bind({ now: '2026-10-19 00:00:00.000Z' }).all(rows);
    output[name] = rows;
  }
  const rows = arrayOf(new DynamicModel({ id: 0, parent: 0, notused: 0, detail: '' }));
  e.app.db().newQuery('EXPLAIN QUERY PLAN SELECT id FROM account_deletions WHERE created <= {:cutoff} ORDER BY created LIMIT 100').bind({ cutoff: '2001-01-01' }).all(rows);
  output.audit = rows;
  return e.json(200, output);
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
      next_alert: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
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
  const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toUTCString();
  handler = () => ({ status: 429, headers: { 'Retry-After': futureDate } });
  await run();
  assert.ok(
    Date.parse(row(id).next_attempt) >= Date.parse(futureDate),
    'HTTP-date Retry-After is honored'
  );

  id = await create();
  handler = () => ({ status: 429, headers: { 'Retry-After': '31536000' } });
  const yearStart = Date.now();
  await run();
  const rateLimitedUntil = row(id).next_attempt;
  assert.ok(Date.parse(rateLimitedUntil) >= yearStart + 31535999_000);
  const beforeOverdue = requests.length;
  db.prepare(
    "UPDATE account_deletion_jobs SET created = '2000-01-01 00:00:00.000Z', next_alert = '2000-01-15 00:00:00.000Z' WHERE id = ?"
  ).run(id);
  await run();
  assert.equal(requests.length, beforeOverdue, 'alert scan must not ignore vendor rate limits');
  assert.equal(row(id).next_attempt, rateLimitedUntil);
  assert.ok(row(id).alerted_at, 'overdue warning is independent of next_attempt');
  const overdueAlerted = row(id).alerted_at;
  await run();
  assert.equal(row(id).alerted_at, overdueAlerted, 'overdue alerts suppressed for 24 hours');

  id = await create();
  handler = () => ({ status: 429, headers: { 'Retry-After': '1000000000000000000' } });
  await run();
  assert.equal(row(id).posthog_status, 'blocked');
  assert.equal(row(id).last_error, 'rate_limit_invalid');
  assert.ok(Number.isFinite(Date.parse(row(id).next_attempt)));
  assert.equal(row(id).lease_token, '', 'unrepresentable retry releases lease durably');
  assert.ok(row(id).alerted_at);

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
  assert.equal(
    row(id).posthog_status,
    'blocked',
    'unattributable vendor completion must remain unresolved'
  );
  assert.equal(row(id).last_error, 'verification_attribution');
  assert.equal(row(id).posthog_verified_at, '');
  assert.ok(row(id).posthog_target, 'retain target until current-request erasure can be proven');
  for (const entries of [
    [
      {
        person_uuid: uuid,
        status: 'completed',
        created_at: '2000-01-01T00:00:00Z',
        delete_verified_at: '2000-01-02T00:00:00Z',
      },
      { person_uuid: uuid, status: 'completed', created_at: now(), delete_verified_at: now() },
    ],
    [
      {
        person_uuid: uuid,
        status: 'completed',
        created_at: new Date(Date.now() - 2000).toISOString(),
        delete_verified_at: now(),
      },
    ],
  ]) {
    due(id);
    handler = () => ({ body: { results: entries, next: null } });
    await run();
    assert.equal(
      row(id).last_error,
      'verification_attribution',
      'mixed history and skew have explicit attribution blockers, never inferred success'
    );
    assert.equal(row(id).posthog_verified_at, '');
  }

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

  id = await create();
  const sharedUser = await request('/api/collections/users/records', {
    email: 'synthetic-shared@localhost.test',
    password: 'disposable-password-123',
    passwordConfirm: 'disposable-password-123',
    username: 'sharedfixture',
    verified: true,
  });
  assert.equal(sharedUser.status, 200);
  const sharedIds = [row(id).user_id, 'anonymous-device', sharedUser.body.id];
  handler = req => ({
    body: req.url.includes(`/${uuid}/`)
      ? { uuid, distinct_ids: sharedIds }
      : { results: [{ id: uuid }], next: null },
  });
  const beforeSharedDelete = requests.filter(r => r.method === 'DELETE').length;
  await run();
  assert.equal(row(id).posthog_status, 'blocked');
  assert.equal(row(id).last_error, 'identity_shared');
  assert.deepEqual(
    JSON.parse(row(id).posthog_target).distinctIds,
    sharedIds,
    'preserve shared manifest for reconciliation'
  );
  assert.equal(requests.filter(r => r.method === 'DELETE').length, beforeSharedDelete);

  id = await create();
  db.prepare(
    "UPDATE account_deletion_jobs SET posthog_status = 'requested', posthog_target = ?, posthog_requested_at = ?, created = '2000-01-01 00:00:00.000Z', next_alert = '2000-01-15 00:00:00.000Z' WHERE id = ?"
  ).run(
    JSON.stringify({ host, projectId: '123', personId: uuid, distinctIds: [row(id).user_id] }),
    now(),
    id
  );
  handler = () => ({
    body: {
      results: [
        { person_uuid: uuid, status: 'pending', created_at: now(), delete_verified_at: null },
      ],
      next: null,
    },
  });
  await run();
  assert.equal(row(id).last_error, 'verification_pending');
  assert.ok(row(id).alerted_at, '14-day pending verification alerts');
  const pendingAlerted = row(id).alerted_at;
  due(id);
  await run();
  assert.equal(
    row(id).alerted_at,
    pendingAlerted,
    'pending verification alert suppressed for 24 hours'
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
      next_alert: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(result.status, 200);
    batch.push(result.body.id);
  }
  handler = () => ({ status: 503 });
  assert.equal((await run()).attempted, 10, 'cron work is bounded');
  assert.equal(batch.filter(jobId => row(jobId).attempts === 1).length, 10);
  // Production PB schema + exact production claim SQL against a retained backlog.
  db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 100000)
    INSERT INTO account_deletion_jobs (id, user_id, source_kind, posthog_status, created, updated)
    SELECT printf('retained%07d', x), printf('retained%07d', x), 'legacy', 'completed', '2000-01-01 00:00:00.000Z', '2000-01-01 00:00:00.000Z' FROM n`);
  db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 100000)
    INSERT INTO account_deletions (id, user_id, user_email, signup_method, created, updated)
    SELECT printf('oldaudit%07d', x), 'synthetic', 'synthetic@localhost.test', 'unknown', '2000-01-01 00:00:00.000Z', '2000-01-01 00:00:00.000Z' FROM n`);
  const plans = await request('/api/test/posthog/plans', {});
  assert.equal(plans.status, 200);
  for (const [name, index] of Object.entries({
    claim: 'idx_account_deletion_work',
    alerts: 'idx_account_deletion_alert',
    audit: 'idx_account_deletions_created',
  })) {
    const detail = plans.body[name].map(row => row.detail).join('\n');
    assert.ok(detail.includes(index), `${name} uses its production index: ${detail}`);
    assert.ok(!detail.includes('TEMP B-TREE'), `${name} avoids a temporary sort`);
    assert.ok(
      !detail.includes('SCAN account_deletion'),
      `${name} avoids a full retained-table scan`
    );
  }
  writeFileSync(path.join(runDir, 'query-plans.json'), JSON.stringify(plans.body, null, 2));
  assert.equal((await run()).attempted, 2, 'actual PB claim skips 100000 completed receipts');
  assert.equal(
    db
      .prepare(
        "SELECT SUM(attempts) AS attempts FROM account_deletion_jobs WHERE id LIKE 'retained%'"
      )
      .get().attempts,
    0
  );
  const priorAudits = db.prepare('SELECT COUNT(*) AS count FROM account_deletions').get().count;
  assert.equal((await request('/api/test/apple/deletion-retention', {})).status, 200);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM account_deletions').get().count,
    priorAudits - 100,
    'actual PB retention remains bounded under backlog'
  );
  db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 250)
    INSERT INTO account_deletion_jobs (id, user_id, source_kind, posthog_status, created, updated, next_attempt, next_alert, last_error)
    SELECT printf('blocked%08d', x), printf('blocked%08d', x), 'legacy', 'blocked', '2026-01-01 00:00:00.000Z', '2026-01-01 00:00:00.000Z', '2099-01-01 00:00:00.000Z', '2000-01-01 00:00:00.000Z', 'identity_missing' FROM n`);
  const beforeAlerts = requests.length;
  for (const expected of [100, 100, 50, 0])
    assert.equal(
      (await run()).alerted,
      expected,
      'alerts use a bounded aggregate with durable per-job suppression'
    );
  assert.equal(requests.length, beforeAlerts, 'alert-only backlog does not contact vendor');

  console.log(
    'PostHog worker: fail closed config, durable target, backoff, crash recovery, verification, and stale claims passed.'
  );
  console.log(`Private fixture artifacts: ${runDir}`);
} finally {
  db?.close();
  await fixture?.close();
  await new Promise(resolve => server.close(resolve));
}

await testErasureConfiguration(runDir);
console.log(
  'PostHog production configuration: invalid nonempty host, project and key values fail closed before transport.'
);
