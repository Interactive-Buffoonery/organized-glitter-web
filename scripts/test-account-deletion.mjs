#!/usr/bin/env node

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startAppleFixture } from './test-support/apple/fixture.mjs';

const fixture = await startAppleFixture();
const { root, baseUrl, dataDir, adminEmail, adminPassword } = fixture;
let db;
const request = async (route, token, body, method = 'POST') => {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null };
};
const secret = () => randomBytes(32).toString('base64url');
try {
  let result = await request('/api/collections/_superusers/auth-with-password', '', {
    identity: adminEmail,
    password: adminPassword,
  });
  assert.equal(result.status, 200);
  const admin = result.body.token;
  result = await request(
    '/api/collections/import',
    admin,
    {
      collections: JSON.parse(
        readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')
      ),
      deleteMissing: false,
    },
    'PUT'
  );
  assert.equal(result.status, 204);
  const password = 'disposable-deletion-password-123';
  const makeUser = async (suffix, verified = true) => {
    const identity = `deletion-${suffix}@localhost.test`;
    const created = await request('/api/collections/users/records', admin, {
      email: identity,
      password,
      passwordConfirm: password,
      username: `deletion${suffix}`,
      verified: true,
    });
    assert.equal(created.status, 200);
    const auth = await request('/api/collections/users/auth-with-password', '', {
      identity,
      password,
    });
    assert.equal(auth.status, 200);
    if (!verified) {
      assert.equal(
        (
          await request(
            `/api/collections/users/records/${created.body.id}`,
            admin,
            { verified: false },
            'PATCH'
          )
        ).status,
        200
      );
    }
    return { id: created.body.id, token: auth.body.token };
  };
  const owner = await makeUser('owner');
  const other = await makeUser('other');
  const unverified = await makeUser('unverified', false);
  const deletion = (token, proof, confirmed = true) =>
    request('/api/account/delete', token, { proof, confirmed });
  const verify = (user, proof, suppliedPassword = password) =>
    request('/api/auth/step-up/password', user.token, {
      action: 'delete_account',
      targetProvider: 'account',
      password: suppliedPassword,
      proof,
    });
  assert.equal((await deletion('', secret())).status, 401, 'guests cannot initiate deletion');
  assert.equal((await deletion(owner.token, secret())).status, 403, 'a session is not fresh proof');
  assert.equal((await verify(unverified, secret())).status, 403);
  assert.equal((await verify(owner, secret(), 'incorrect')).status, 400);
  const proof = secret();
  assert.equal((await verify(owner, proof)).status, 204);
  assert.equal((await deletion(owner.token, proof, false)).status, 400);
  assert.equal((await deletion(other.token, proof)).status, 403, 'proof is account bound');
  assert.equal(
    (
      await request('/api/account/delete', owner.token, {
        proof,
        confirmed: true,
        userId: other.id,
      })
    ).status,
    400
  );
  result = await request('/api/collections/projects/records', admin, {
    user: owner.id,
    title: 'Disposable project',
    status: 'stash',
    kit_category: 'full',
  });
  assert.equal(result.status, 200);
  const imageBody = new FormData();
  imageBody.append(
    'image',
    new File(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64'
        ),
      ],
      'disposable.png',
      { type: 'image/png' }
    )
  );
  const imageResponse = await fetch(
    `${baseUrl}/api/collections/projects/records/${result.body.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${admin}` },
      body: imageBody,
    }
  );
  assert.equal(imageResponse.status, 200);
  const imageRecord = await imageResponse.json();
  const imagePath = path.join(
    dataDir,
    'storage',
    imageRecord.collectionId,
    imageRecord.id,
    imageRecord.image
  );
  assert.ok(existsSync(imagePath));
  const projectId = result.body.id;
  db = new DatabaseSync(path.join(dataDir, 'data.db'));
  db.exec(
    `CREATE TRIGGER fail_deletion_test BEFORE DELETE ON users WHEN OLD.id = '${owner.id}' BEGIN SELECT RAISE(ABORT, 'disposable failure'); END;`
  );
  assert.notEqual((await deletion(owner.token, proof)).status, 200);
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(owner.id));
  assert.ok(db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId));
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM account_deletion_jobs').get().count,
    0,
    'failure rolls back receipt'
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM auth_step_up_proofs WHERE user = ?').get(owner.id)
      .count,
    1,
    'failure preserves proof'
  );
  assert.ok(existsSync(imagePath), 'rollback preserves stored files');
  db.exec('DROP TRIGGER fail_deletion_test');
  const concurrentDeletions = await Promise.all([
    deletion(owner.token, proof),
    deletion(owner.token, proof),
  ]);
  assert.ok(
    concurrentDeletions.every(response => response.status === 200),
    'concurrent retries complete once'
  );
  const completed = concurrentDeletions[0];
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.body, { status: 'deleted', cleanup: 'pending' });
  assert.equal(db.prepare('SELECT id FROM users WHERE id = ?').get(owner.id), undefined);
  assert.equal(db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId), undefined);
  assert.equal(existsSync(imagePath), false, 'successful deletion removes stored files');
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(other.id));
  assert.equal(
    (await deletion('', proof)).status,
    200,
    'lost response can be retried without deleted session'
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_deletion_jobs').get().count, 1);
  assert.equal((await deletion('', secret())).status, 401);
  assert.equal((await request('/api/collections/users/auth-refresh', owner.token, {})).status, 401);
  assert.equal(
    (
      await request('/api/collections/account_deletion_jobs/records', other.token, {
        user_id: other.id,
      })
    ).status,
    403
  );
  const expired = secret();
  assert.equal((await verify(other, expired)).status, 204);
  db.prepare(
    "UPDATE auth_step_up_proofs SET expires = '2000-01-01 00:00:00.000Z' WHERE user = ?"
  ).run(other.id);
  assert.equal((await deletion(other.token, expired)).status, 403);
  assert.equal(
    (await request(`/api/collections/users/records/${other.id}`, other.token, undefined, 'DELETE'))
      .status,
    204,
    'older client deletion remains compatible'
  );
  result = await request(
    '/api/collections/users',
    admin,
    {
      oauth2: {
        enabled: true,
        providers: [
          { name: 'apple', clientId: 'web-test-client', clientSecret: 'web-test-secret' },
        ],
      },
    },
    'PATCH'
  );
  assert.equal(result.status, 200);
  const settings = await request('/api/settings', admin, undefined, 'GET');
  settings.body.rateLimits.enabled = true;
  for (const rule of settings.body.rateLimits.rules) rule.maxRequests = 100;
  assert.equal(
    (await request('/api/settings', admin, { rateLimits: settings.body.rateLimits }, 'PATCH'))
      .status,
    200
  );
  assert.equal(
    (
      await request(
        '/api/collections/users',
        admin,
        {
          oauth2: {
            enabled: true,
            providers: [
              { name: 'apple', clientId: 'web-test-client', clientSecret: 'web-test-secret' },
              {
                name: 'discord',
                clientId: 'disposable-discord',
                clientSecret: 'disposable-secret',
                authURL: `${fixture.oauthUrl}/authorize`,
                tokenURL: `${fixture.oauthUrl}/token`,
                userInfoURL: `${fixture.oauthUrl}/user`,
              },
            ],
          },
        },
        'PATCH'
      )
    ).status,
    200
  );
  const oauth = createData =>
    request('/api/collections/users/auth-with-oauth2', '', {
      provider: 'discord',
      code: 'success',
      codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
      createData,
    });
  result = await oauth({});
  assert.equal(result.status, 200);
  const oauthUserId = result.body.record.id;
  const oauthProof = secret();
  assert.equal(
    (
      await oauth({
        og_step_up_action: 'delete_account',
        og_step_up_target_provider: 'account',
        og_step_up_user_id: unverified.id,
        og_step_up_proof: oauthProof,
      })
    ).status,
    403
  );
  result = await oauth({
    og_step_up_action: 'delete_account',
    og_step_up_target_provider: 'account',
    og_step_up_user_id: oauthUserId,
    og_step_up_proof: oauthProof,
  });
  assert.equal(result.status, 200);
  const externalAuth = db
    .prepare('SELECT * FROM _externalAuths WHERE recordRef = ? AND provider = ?')
    .get(oauthUserId, 'discord');
  db.prepare('DELETE FROM _externalAuths WHERE id = ?').run(externalAuth.id);
  assert.equal(
    (await deletion(result.body.token, oauthProof)).status,
    403,
    'an unlinked identity cannot authorize deletion'
  );
  const columns = Object.keys(externalAuth);
  db.prepare(
    `INSERT INTO _externalAuths (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`
  ).run(...columns.map(column => externalAuth[column]));
  assert.equal(
    (await deletion(result.body.token, oauthProof)).status,
    200,
    'existing linked OAuth method can authorize deletion'
  );
  const apple = body =>
    request('/api/auth/apple/native', '', {
      code: 'first',
      nonce: 'disposable_test_nonce_1234567890',
      ...body,
    });
  result = await apple({});
  assert.equal(result.status, 200);
  const appleUser = result.body.record;
  const appleProof = secret();
  assert.equal(
    (await apple({ deletionProof: appleProof, deletionUserId: unverified.id })).status,
    403,
    'Apple proof cannot switch accounts'
  );
  result = await apple({ deletionProof: appleProof, deletionUserId: appleUser.id });
  assert.equal(result.status, 200);
  const appleToken = result.body.token;
  db.exec(
    `CREATE TRIGGER fail_queue_test BEFORE UPDATE OF state ON apple_oauth_grants WHEN NEW.state = 'revocation_pending' BEGIN SELECT RAISE(ABORT, 'disposable failure'); END;`
  );
  assert.notEqual((await deletion(appleToken, appleProof)).status, 200);
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(appleUser.id));
  assert.equal(
    db.prepare('SELECT id FROM account_deletion_jobs WHERE user_id = ?').get(appleUser.id),
    undefined
  );
  assert.equal(
    db.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(appleUser.id).state,
    'active'
  );
  db.exec('DROP TRIGGER fail_queue_test');
  assert.equal((await deletion(appleToken, appleProof)).status, 200);
  assert.equal(
    db.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(appleUser.id).state,
    'revocation_pending'
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM account_deletions').get().count,
    0,
    'new route does not retain emails or feedback'
  );
  const runRetention = () => request('/api/test/apple/deletion-retention', admin, {});
  const receipt = db
    .prepare('SELECT id FROM account_deletion_jobs WHERE user_id = ?')
    .get(owner.id);
  assert.equal(
    (
      await request(
        `/api/collections/account_deletion_jobs/records/${receipt.id}`,
        unverified.token,
        undefined,
        'GET'
      )
    ).status,
    403
  );
  assert.equal(
    (
      await request(
        `/api/collections/account_deletion_jobs/records/${receipt.id}`,
        unverified.token,
        { posthog_status: 'completed' },
        'PATCH'
      )
    ).status,
    403
  );
  db.prepare(
    "UPDATE account_deletion_jobs SET cleanup_completed = '2000-01-01 00:00:00.000Z' WHERE user_id = ?"
  ).run(owner.id);
  assert.equal((await runRetention()).status, 200);
  assert.ok(
    db.prepare('SELECT id FROM account_deletion_jobs WHERE user_id = ?').get(owner.id),
    'pending vendor work prevents expiry'
  );
  db.prepare(
    "UPDATE account_deletion_jobs SET posthog_status = 'completed', revenuecat_status = 'completed', cleanup_completed = '' WHERE user_id = ?"
  ).run(owner.id);
  assert.equal((await runRetention()).status, 200);
  assert.ok(
    db
      .prepare('SELECT cleanup_completed FROM account_deletion_jobs WHERE user_id = ?')
      .get(owner.id).cleanup_completed,
    'server timestamps complete cleanup'
  );
  assert.deepEqual((await deletion('', proof)).body, { status: 'deleted', cleanup: 'completed' });
  db.prepare(
    "UPDATE account_deletion_jobs SET cleanup_completed = '2000-01-01 00:00:00.000Z' WHERE user_id = ?"
  ).run(owner.id);
  db.prepare(
    "UPDATE account_deletion_jobs SET posthog_status = 'completed', revenuecat_status = 'completed', cleanup_completed = '2000-01-01 00:00:00.000Z' WHERE user_id = ?"
  ).run(appleUser.id);
  assert.equal((await runRetention()).status, 200);
  assert.equal(
    db.prepare('SELECT id FROM account_deletion_jobs WHERE user_id = ?').get(owner.id),
    undefined
  );
  assert.ok(
    db.prepare('SELECT id FROM account_deletion_jobs WHERE user_id = ?').get(appleUser.id),
    'pending Apple revocation prevents expiry'
  );
  assert.equal(
    (await deletion('', proof)).status,
    401,
    'expired receipt does not assert successful deletion'
  );
  console.log(
    'Account deletion: authentication, proof binding, rollback, retry, cascades, Apple queue, and older clients passed.'
  );
} finally {
  db?.close();
  await fixture.close();
}
