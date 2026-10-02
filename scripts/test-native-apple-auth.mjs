#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { testAppleConfiguration } from './test-support/apple/configuration.mjs';
import { startAppleFixture } from './test-support/apple/fixture.mjs';

const request = async (url, options = {}) => {
  const response = await fetch(url, options);
  const raw = await response.text();
  const isJson = response.headers.get('content-type')?.includes('application/json');
  return { status: response.status, headers: response.headers, body: raw && isJson ? JSON.parse(raw) : null };
};

const fixture = await startAppleFixture();
const { root, runDir, dataDir, baseUrl, oauthUrl, adminEmail, adminPassword } = fixture;
let grantDb;
try {
  let result = await request(`${baseUrl}/api/auth/apple/native/readiness`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { available: false });

  result = await request(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  assert.equal(result.status, 200);
  const adminHeaders = { Authorization: `Bearer ${result.body.token}`, 'Content-Type': 'application/json' };
  result = await request(`${baseUrl}/api/test/apple/revocation-cron`, { headers: adminHeaders });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { registered: false }, 'the fixture disables scheduled revocation');
  const settingsForTest = await request(`${baseUrl}/api/settings`, { headers: adminHeaders });
  assert.equal(settingsForTest.status, 200);
  const authRule = settingsForTest.body.rateLimits.rules.find(rule => rule.label === '*:auth');
  assert.ok(authRule);
  assert.equal(settingsForTest.body.rateLimits.rules.find(rule => rule.label === 'POST /api/auth/apple/native').maxRequests, 5);
  assert.equal(settingsForTest.body.rateLimits.rules.find(rule => rule.label === 'GET /api/auth/apple/native/readiness').maxRequests, 12);
  authRule.maxRequests = 10;
  settingsForTest.body.rateLimits.rules.find(rule => rule.label === 'POST /api/auth/apple/native').maxRequests = 100;
  settingsForTest.body.rateLimits.rules.find(rule => rule.label === 'GET /api/auth/apple/native/readiness').maxRequests = 100;
  settingsForTest.body.rateLimits.enabled = true;
  result = await request(`${baseUrl}/api/settings`, {
    method: 'PATCH', headers: adminHeaders,
    body: JSON.stringify({ rateLimits: settingsForTest.body.rateLimits }),
  });
  assert.equal(result.status, 200);

  result = await request(`${baseUrl}/api/collections/import`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ collections: JSON.parse(readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')), deleteMissing: false }),
  });
  assert.equal(result.status, 204);

  result = await request(`${baseUrl}/api/collections/users`, {
    method: 'PATCH', headers: adminHeaders,
    body: JSON.stringify({ oauth2: { enabled: true, providers: [
      { name: 'apple', clientId: 'web-test-client', clientSecret: 'web-test-secret' },
      { name: 'discord', clientId: 'disposable-discord', clientSecret: 'disposable-secret',
        authURL: `${oauthUrl}/authorize`, tokenURL: `${oauthUrl}/token`, userInfoURL: `${oauthUrl}/user` },
    ] } }),
  });
  assert.equal(result.status, 200);

  result = await request(`${baseUrl}/api/auth/apple/native/readiness`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { available: true });

  await testAppleConfiguration(fixture, request, adminHeaders);

  const configuredRates = structuredClone(settingsForTest.body.rateLimits);
  for (const rates of [
    { ...configuredRates, enabled: false },
    { ...configuredRates, rules: configuredRates.rules.filter(rule => rule.label !== 'POST /api/auth/apple/native') },
    { ...configuredRates, rules: configuredRates.rules.filter(rule => rule.label !== 'GET /api/auth/apple/native/readiness') },
  ]) {
    result = await request(`${baseUrl}/api/settings`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ rateLimits: rates }),
    });
    assert.equal(result.status, 200);
    assert.deepEqual((await request(`${baseUrl}/api/auth/apple/native/readiness`)).body, { available: false });
    result = await request(`${baseUrl}/api/auth/apple/native`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'gate-check', nonce: 'disposable_test_nonce_1234567890' }),
    });
    assert.equal(result.status, 503, 'POST and readiness reject the same missing rate protection');
  }
  result = await request(`${baseUrl}/api/settings`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ rateLimits: configuredRates }),
  });
  assert.equal(result.status, 200);

  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'discord', code: 'disposable-code', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    }),
  });
  assert.equal(result.status, 400, 'standard OAuth also rejects new user without required email');

  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'discord', code: 'success', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    }),
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const webUserId = result.body.record.id;
  grantDb = new DatabaseSync(path.join(dataDir, 'data.db'));
  const failedIdentity = createHash('sha256').update('apple-test-grant-fail').digest('hex');
  grantDb.exec(`CREATE TRIGGER fail_test_grant BEFORE INSERT ON apple_oauth_grants
    WHEN NEW.provider_id_hash = '${failedIdentity}'
    BEGIN SELECT RAISE(ABORT, 'disposable grant failure'); END;`);
  const webCiphertext = grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(webUserId)?.ciphertext;
  assert.ok(webCiphertext && webCiphertext !== 'disposable-web-refresh-token');
  assert.equal(
    grantDb.prepare('SELECT client_id FROM apple_oauth_grants WHERE user_id = ?').get(webUserId).client_id,
    'disposable-discord',
    'the web grant belongs to the provider client that performed the exchange'
  );
  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'discord', code: 'web-fail', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    }),
  });
  assert.notEqual(result.status, 200, 'a new web identity cannot outlive failed grant storage');
  assert.equal(result.body.data.reason.code, 'apple_grant_prepare_failed');
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM users WHERE email = 'webfail@localhost.test'").get().count, 0);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE providerId = 'disposable-web-fail'").get().count, 0);

  const webDbFailure = createHash('sha256').update('disposable-web-db-fail').digest('hex');
  grantDb.exec(`CREATE TRIGGER fail_test_web_grant BEFORE INSERT ON apple_oauth_grants
    WHEN NEW.provider_id_hash = '${webDbFailure}'
    BEGIN SELECT RAISE(ABORT, 'disposable web grant failure'); END;`);
  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'discord', code: 'web-db-fail', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    }),
  });
  assert.notEqual(result.status, 200, 'failed post-OAuth grant persistence cannot return an auth token');
  assert.equal(result.body.data.reason.code, 'apple_grant_storage_failed');
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM users WHERE email = 'webdbfail@localhost.test'").get().count, 0);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE providerId = 'disposable-web-db-fail'").get().count, 0);
  grantDb.exec('DROP TRIGGER fail_test_web_grant');

  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'discord', code: 'web-no-refresh', codeVerifier: 'disposable-verifier', redirectURL: `${baseUrl}/api/oauth2-redirect` }),
  });
  assert.equal(result.status, 200, 'web sign-in without a refresh token preserves the existing grant');
  assert.equal(result.body.record.id, webUserId);
  assert.equal(grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(webUserId).ciphertext, webCiphertext);
  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'discord', code: 'web-refresh-fail', codeVerifier: 'disposable-verifier', redirectURL: `${baseUrl}/api/oauth2-redirect` }),
  });
  assert.equal(result.status, 503, 'a newly issued refresh token must be stored even for an existing link');
  assert.equal(result.body.data.reason.code, 'apple_grant_prepare_failed');
  assert.equal(grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(webUserId).ciphertext, webCiphertext);

  result = await request(`${baseUrl}/api/collections/users/records/${webUserId}`, {
    method: 'PATCH', headers: adminHeaders,
    body: JSON.stringify({ password: 'web-password-123', passwordConfirm: 'web-password-123' }),
  });
  assert.equal(result.status, 200);
  result = await request(`${baseUrl}/api/collections/users/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'webtest@localhost.test', password: 'web-password-123' }),
  });
  assert.equal(result.status, 200);
  const webHeaders = { Authorization: `Bearer ${result.body.token}`, 'Content-Type': 'application/json' };
  const webLinkProof = 'L'.repeat(43);
  result = await request(`${baseUrl}/api/auth/step-up/password`, {
    method: 'POST', headers: webHeaders,
    body: JSON.stringify({
      action: 'link', password: 'web-password-123', proof: webLinkProof, targetProvider: 'discord',
    }),
  });
  assert.equal(result.status, 204);
  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: webHeaders,
    body: JSON.stringify({
      provider: 'discord', code: 'web-no-refresh', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
      createData: { og_step_up_proof: webLinkProof },
    }),
  });
  assert.equal(result.status, 200, 'an authenticated web link consumes its proof in the grant transaction');
  assert.equal(result.body.record.id, webUserId);

  result = await request(`${baseUrl}/api/auth/apple/native`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(result.status, 400);
  result = await request(`${baseUrl}/api/auth/apple/native`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: 'first', nonce: 'nonce' }) });
  assert.equal(result.status, 403);
  result = await request(`${baseUrl}/api/collections/apple_oauth_grants/records`, { headers: { 'Content-Type': 'application/json' } });
  assert.notEqual(result.status, 200, 'grant collection is not publicly readable');

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'collision@localhost.test', username: 'collisionfixture',
      password: 'collision-password-123', passwordConfirm: 'collision-password-123',
      verified: true,
    }),
  });
  assert.equal(result.status, 200);
  const collisionId = result.body.id;

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'CaseCollision@localhost.test', username: 'casecollisionfixture',
      password: 'case-collision-password-123', passwordConfirm: 'case-collision-password-123',
      verified: true,
    }),
  });
  assert.equal(result.status, 200);
  const caseCollisionId = result.body.id;
  assert.equal(grantDb.prepare('SELECT email FROM users WHERE id = ?').get(caseCollisionId).email, 'CaseCollision@localhost.test');

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'unverified@localhost.test', username: 'unverifiedfixture',
      password: 'unverified-password-123', passwordConfirm: 'unverified-password-123',
      verified: false,
    }),
  });
  assert.equal(result.status, 200);
  const unverifiedId = result.body.id;
  const usersCollection = JSON.parse(readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8'))
    .find(collection => collection.name === 'users');
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('unverifiedlink1', usersCollection.id, unverifiedId, 'apple', 'apple-test-unverified');
  const unverifiedBefore = grantDb.prepare('SELECT password, tokenKey, verified FROM users WHERE id = ?').get(unverifiedId);

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'MixedUnverified@localhost.test', username: 'mixedunverifiedfixture',
      password: 'mixed-unverified-password-123', passwordConfirm: 'mixed-unverified-password-123',
      verified: false,
    }),
  });
  assert.equal(result.status, 200);
  const mixedUnverifiedId = result.body.id;
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('mixedunverified', usersCollection.id, mixedUnverifiedId, 'apple', 'apple-test-mixedunverified');
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('mixeddiscord', usersCollection.id, mixedUnverifiedId, 'discord', 'disposable-mixed-unverified');
  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'oldmixedgrant01', mixedUnverifiedId,
      createHash('sha256').update('apple-test-mixedunverified').digest('hex'),
      'com.interactivebuffoonery.organizedglitter', webCiphertext
    );
  const mixedUnverifiedBefore = grantDb.prepare('SELECT password, tokenKey FROM users WHERE id = ?').get(mixedUnverifiedId);

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'verified@localhost.test', username: 'verifiedfixture',
      password: 'verified-password-123', passwordConfirm: 'verified-password-123',
      verified: true,
    }),
  });
  assert.equal(result.status, 200);
  const verifiedId = result.body.id;
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('verifiedapple', usersCollection.id, verifiedId, 'apple', 'apple-test-verified');
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('verifieddiscord', usersCollection.id, verifiedId, 'discord', 'disposable-verified');
  const verifiedBefore = grantDb.prepare('SELECT password, tokenKey FROM users WHERE id = ?').get(verifiedId);

  const nonce = 'disposable_test_nonce_1234567890';
  const signIn = code => request(`${baseUrl}/api/auth/apple/native`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, nonce }),
  });
  const first = await signIn('first');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.record.verified, true);
  assert.ok(first.body.token);
  assert.equal(first.body.meta.isNew, true);
  const nativeCiphertext = grantDb
    .prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?')
    .get(first.body.record.id)?.ciphertext;
  assert.ok(nativeCiphertext && nativeCiphertext !== 'disposable-test-refresh-token');
  const grantAudit = JSON.parse(execFileSync(process.execPath, [
    path.join(root, 'scripts/audit-apple-grants.mjs'), path.join(dataDir, 'data.db'),
    '--client-id', 'com.interactivebuffoonery.organizedglitter',
  ], { encoding: 'utf8' }));
  assert.deepEqual(grantAudit.byClientId, [
    { clientId: 'com.interactivebuffoonery.organizedglitter', linksWithoutActiveGrant: 2 },
    { clientId: 'web-test-client', linksWithoutActiveGrant: 4 },
  ], 'the audit counts missing grants separately for native and web clients');
  assert.equal(grantAudit.linksWithoutGrant, 6);

  result = await signIn('repeat');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.record.id, first.body.record.id);
  assert.equal(result.body.meta.isNew, false);
  assert.equal(
    grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id)?.ciphertext,
    nativeCiphertext
  );

  result = await signIn('first');
  assert.equal(result.status, 200, 'a fresh grant updates the existing native identity');
  assert.equal(result.body.record.id, first.body.record.id);
  assert.equal(grantDb.prepare('SELECT COUNT(*) AS count FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id).count, 1);
  assert.notEqual(grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id).ciphertext, nativeCiphertext);

  result = await signIn('collision');
  assert.equal(result.status, 409);
  result = await request(`${baseUrl}/api/collections/users/records/${collisionId}`, { headers: adminHeaders });
  assert.equal(result.status, 200);

  result = await signIn('casecollision');
  assert.equal(result.status, 409, 'a differently cased Apple email cannot create a second account');
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM users WHERE lower(email) = 'casecollision@localhost.test'").get().count, 1);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE providerId = 'apple-test-casecollision'").get().count, 0);

  result = await signIn('no-email');
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.message, 'Apple did not provide an email for this account.');

  result = await signIn('unverified');
  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.deepEqual(grantDb.prepare('SELECT password, tokenKey, verified FROM users WHERE id = ?').get(unverifiedId), unverifiedBefore);
  assert.equal(grantDb.prepare('SELECT COUNT(*) AS count FROM _externalAuths WHERE recordRef = ?').get(unverifiedId).count, 1);
  assert.equal(grantDb.prepare('SELECT COUNT(*) AS count FROM apple_oauth_grants WHERE user_id = ?').get(unverifiedId).count, 0);

  result = await signIn('mixedunverified');
  assert.equal(result.status, 200, 'a linked unverified account accepts a case-only provider email difference');
  assert.equal(result.body.record.id, mixedUnverifiedId);
  assert.equal(result.body.record.verified, true);
  assert.equal(grantDb.prepare('SELECT email FROM users WHERE id = ?').get(mixedUnverifiedId).email, 'MixedUnverified@localhost.test');
  const mixedUnverifiedAfter = grantDb.prepare('SELECT password, tokenKey FROM users WHERE id = ?').get(mixedUnverifiedId);
  assert.notEqual(mixedUnverifiedAfter.password, mixedUnverifiedBefore.password, 'verification replaces the unverified password');
  assert.notEqual(mixedUnverifiedAfter.tokenKey, mixedUnverifiedBefore.tokenKey, 'verification invalidates old tokens');
  assert.deepEqual(grantDb.prepare('SELECT provider, providerId FROM _externalAuths WHERE recordRef = ?').all(mixedUnverifiedId).map(link => ({ ...link })), [
    { provider: 'apple', providerId: 'apple-test-mixedunverified' },
  ]);
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(mixedUnverifiedId).state, 'active');

  result = await signIn('verified');
  assert.equal(result.status, 200, 'a verified linked account signs in without changing its other credentials');
  assert.equal(result.body.record.id, verifiedId);
  assert.deepEqual(grantDb.prepare('SELECT password, tokenKey FROM users WHERE id = ?').get(verifiedId), verifiedBefore);
  assert.deepEqual(grantDb.prepare('SELECT provider, providerId FROM _externalAuths WHERE recordRef = ? ORDER BY provider').all(verifiedId).map(link => ({ ...link })), [
    { provider: 'apple', providerId: 'apple-test-verified' },
    { provider: 'discord', providerId: 'disposable-verified' },
  ]);
  const verifiedToken = result.body.token;

  result = await signIn('wrong-nonce');
  assert.equal(result.status, 400);
  result = await signIn('provider-invalid');
  assert.equal(result.status, 400);
  result = await signIn('provider-unavailable');
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('retry-after'), '30');
  result = await signIn('provider-network');
  assert.equal(result.status, 503);
  result = await signIn('claims-invalid');
  assert.equal(result.status, 503, 'untyped verifier failures are retryable');
  assert.equal(result.body.data.reason.code, 'apple_unavailable');
  result = await signIn('jwks-unavailable');
  assert.equal(result.status, 503);
  assert.equal(result.body.data.reason.code, 'apple_unavailable');
  result = await signIn('auth-user-unknown');
  assert.equal(result.status, 503, 'unknown verifier failures fail retryable');
  assert.equal(result.body.data.reason.code, 'apple_unavailable');
  result = await signIn('grant-fail');
  assert.notEqual(result.status, 200);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM users WHERE email = 'grant-fail@localhost.test'").get().count, 0);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE providerId = 'apple-test-grant-fail'").get().count, 0);

  const concurrent = await Promise.all([signIn('concurrent'), signIn('concurrent')]);
  assert.ok(concurrent.some(attempt => attempt.status === 200));
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM users WHERE email = 'concurrent@localhost.test'").get().count, 1);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE providerId = 'apple-test-concurrent'").get().count, 1);

  result = await request(`${baseUrl}/api/collections/apple_oauth_grants/records`, { headers: adminHeaders });
  assert.equal(result.status, 200);
  assert.equal(result.body.totalItems, 5);
  assert.ok(result.body.items.some(item => item.user_id === webUserId));
  for (const grant of result.body.items) {
    assert.notEqual(grant.ciphertext, 'disposable-test-refresh-token');
    assert.equal(grant.state, 'active');
  }
  const storedNative = grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id)?.ciphertext;
  assert.ok(storedNative && storedNative !== 'disposable-test-refresh-token');
  grantDb.prepare("UPDATE apple_oauth_grants SET state = 'revocation_pending' WHERE user_id = ?").run(first.body.record.id);
  result = await signIn('repeat');
  assert.notEqual(result.status, 200, 'native sign-in cannot reuse a grant awaiting revocation');
  assert.equal(result.body.data.reason.code, 'apple_grant_revocation_pending');
  assert.equal(grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id).ciphertext, storedNative);
  grantDb.prepare("UPDATE apple_oauth_grants SET state = 'active' WHERE user_id = ?").run(first.body.record.id);

  const firstGrant = grantDb.prepare('SELECT provider_id_hash, ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id);
  const addPagedGrant = grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`);
  for (let index = 0; index < 101; index += 1) {
    addPagedGrant.run(
      `pagedgrant${String(index).padStart(5, '0')}`, first.body.record.id,
      firstGrant.provider_id_hash, `paged-client-${index}`, firstGrant.ciphertext
    );
  }
  result = await signIn('repeat');
  assert.equal(result.status, 200, 'sign-in checks linked grants across multiple pages');
  grantDb.prepare("UPDATE apple_oauth_grants SET state = 'revocation_pending' WHERE id = 'pagedgrant00100'").run();
  result = await signIn('repeat');
  assert.equal(result.body.data.reason.code, 'apple_grant_revocation_pending');
  grantDb.prepare("UPDATE apple_oauth_grants SET state = 'active', user_id = ? WHERE id = 'pagedgrant00100'").run(webUserId);
  result = await signIn('repeat');
  assert.equal(result.body.data.reason.code, 'apple_grant_orphaned');
  grantDb.prepare("UPDATE apple_oauth_grants SET user_id = ? WHERE id = 'pagedgrant00100'").run(first.body.record.id);
  for (let index = 101; index < 499; index += 1) {
    addPagedGrant.run(
      `pagedgrant${String(index).padStart(5, '0')}`, first.body.record.id,
      firstGrant.provider_id_hash, `paged-client-${index}`, firstGrant.ciphertext
    );
  }
  result = await signIn('repeat');
  assert.equal(result.status, 200, 'the sign-in grant limit includes 500 linked grants');
  addPagedGrant.run(
    'pagedgrant00499', first.body.record.id,
    firstGrant.provider_id_hash, 'paged-client-499', firstGrant.ciphertext
  );
  result = await signIn('repeat');
  assert.equal(result.body.data.reason.code, 'apple_grant_check_limit');
  assert.equal(result.headers.get('retry-after'), '30');
  grantDb.prepare("DELETE FROM apple_oauth_grants WHERE id LIKE 'pagedgrant%'").run();

  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    SELECT 'websecondgrant', user_id, provider_id_hash, 'web-test-client', ciphertext, key_version, state
    FROM apple_oauth_grants WHERE user_id = ?`).run(webUserId);
  grantDb.exec(`CREATE TRIGGER fail_test_revocation_queue BEFORE UPDATE OF state ON apple_oauth_grants
    WHEN NEW.id = 'websecondgrant' AND NEW.state = 'revocation_pending'
    BEGIN SELECT RAISE(ABORT, 'disposable queue failure'); END;`);
  result = await request(`${baseUrl}/api/collections/users/records/${webUserId}`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.notEqual(result.status, 204, 'deletion cannot discard a grant when queueing fails');
  assert.ok(grantDb.prepare('SELECT id FROM users WHERE id = ?').get(webUserId));
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM apple_oauth_grants WHERE user_id = ? AND state = 'active'").get(webUserId).count, 2);
  grantDb.exec('DROP TRIGGER fail_test_revocation_queue');
  grantDb.prepare("DELETE FROM apple_oauth_grants WHERE id = 'websecondgrant'").run();

  grantDb.exec(`CREATE TRIGGER fail_test_user_delete BEFORE DELETE ON users
    WHEN OLD.id = '${webUserId}'
    BEGIN SELECT RAISE(ABORT, 'disposable deletion failure'); END;`);
  result = await request(`${baseUrl}/api/collections/users/records/${webUserId}`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.notEqual(result.status, 204, 'failed deletion rolls queued grants back to active');
  assert.ok(grantDb.prepare('SELECT id FROM users WHERE id = ?').get(webUserId));
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(webUserId).state, 'active');
  grantDb.exec('DROP TRIGGER fail_test_user_delete');

  result = await request(`${baseUrl}/api/collections/users/records/${webUserId}`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.equal(result.status, 204, 'account deletion completes after a grant is queued');
  assert.equal(grantDb.prepare('SELECT id FROM users WHERE id = ?').get(webUserId), undefined);
  const pendingWeb = grantDb.prepare('SELECT state, ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(webUserId);
  assert.equal(pendingWeb.state, 'revocation_pending');
  assert.equal(pendingWeb.ciphertext, webCiphertext, 'queueing keeps the encrypted refresh token');
  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'discord', code: 'success', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    }),
  });
  assert.notEqual(result.status, 200, 'pending revocation blocks a new identity with the same provider ID');
  assert.equal(grantDb.prepare('SELECT ciphertext FROM apple_oauth_grants WHERE user_id = ?').get(webUserId).ciphertext, webCiphertext);

  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.failed, 1, 'provider outage leaves the encrypted grant pending');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(webUserId).state, 'revocation_pending');
  fixture.setRevokeStatus(200);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.revoked, 1, 'the next successful attempt clears the pending grant');
  assert.equal(grantDb.prepare('SELECT id FROM apple_oauth_grants WHERE user_id = ?').get(webUserId), undefined);
  assert.equal(fixture.revokeRequests.length, 2);
  assert.equal(fixture.revokeRequests[0].token, 'disposable-web-refresh-token');
  assert.equal(fixture.revokeRequests[0].client_id, 'disposable-discord');
  assert.equal(fixture.revokeRequests[0].token_type_hint, 'refresh_token');

  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    SELECT 'testsecondgrant', user_id, provider_id_hash, 'web-test-client', ciphertext, key_version, state
    FROM apple_oauth_grants WHERE user_id = ?`).run(first.body.record.id);
  result = await request(`${baseUrl}/api/collections/users/records/${first.body.record.id}`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.equal(result.status, 204);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM apple_oauth_grants WHERE user_id = ? AND state = 'revocation_pending'").get(first.body.record.id).count, 2);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.revoked, 2, 'native and web client grants both revoke');
  assert.equal(grantDb.prepare('SELECT COUNT(*) AS count FROM apple_oauth_grants WHERE user_id = ?').get(first.body.record.id).count, 0);

  const concurrentUserId = grantDb.prepare("SELECT id FROM users WHERE email = 'concurrent@localhost.test'").get().id;
  result = await request(`${baseUrl}/api/test/apple/link/${concurrentUserId}`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.equal(result.status, 204, 'direct Apple link deletion queues revocation');
  assert.ok(grantDb.prepare('SELECT id FROM users WHERE id = ?').get(concurrentUserId));
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(concurrentUserId).state, 'revocation_pending');

  grantDb.exec(`CREATE TRIGGER fail_test_revocation_cleanup BEFORE DELETE ON apple_oauth_grants
    WHEN OLD.user_id = '${concurrentUserId}'
    BEGIN SELECT RAISE(ABORT, 'disposable cleanup failure'); END;`);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 1, 'a failed cleanup retains an already-revoked grant for retry');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(concurrentUserId).state, 'revocation_pending');
  grantDb.exec('DROP TRIGGER fail_test_revocation_cleanup');
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.revoked, 1, 'retry completes after cleanup recovers');
  assert.equal(grantDb.prepare('SELECT id FROM apple_oauth_grants WHERE user_id = ?').get(concurrentUserId), undefined);

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'orphan-old@localhost.test', username: 'orphanfixture',
      password: 'orphan-password-123', passwordConfirm: 'orphan-password-123', verified: false,
    }),
  });
  assert.equal(result.status, 200);
  const orphanUserId = result.body.id;
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('orphanlink00001', usersCollection.id, orphanUserId, 'apple', 'apple-test-orphan');
  const orphanHash = createHash('sha256').update('apple-test-orphan').digest('hex');
  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'orphangrant0001', orphanUserId, orphanHash,
      'com.interactivebuffoonery.organizedglitter', storedNative
    );
  result = await request(`${baseUrl}/api/test/apple/link/${orphanUserId}`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.equal(result.status, 204);
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(orphanUserId).state, 'active');
  result = await signIn('orphan');
  assert.notEqual(result.status, 200, 'an orphan active grant cannot be claimed by a new Apple account');
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM users WHERE email = 'orphan@localhost.test'").get().count, 0);
  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'zzzorphan000001', orphanUserId,
      createHash('sha256').update('apple-test-later-orphan').digest('hex'),
      'later-test-client', storedNative
    );
  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'zzzzorphan00001', orphanUserId,
      createHash('sha256').update('apple-test-last-orphan').digest('hex'),
      'last-test-client', storedNative
    );
  const addBatchLink = grantDb.prepare(
    'INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)'
  );
  const addBatchGrant = grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`);
  for (let index = 0; index < 101; index += 1) {
    const subject = `apple-test-batch-${index}`;
    const batchUser = await request(`${baseUrl}/api/collections/users/records`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        email: `apple-batch-${index}@localhost.test`, username: `applebatch${index}`,
        password: 'batch-password-123', passwordConfirm: 'batch-password-123', verified: true,
      }),
    });
    assert.equal(batchUser.status, 200);
    addBatchLink.run(`batchlink${String(index).padStart(6, '0')}`, usersCollection.id, batchUser.body.id, 'apple', subject);
    addBatchGrant.run(
      `batchgrant${String(index).padStart(5, '0')}`, batchUser.body.id,
      createHash('sha256').update(subject).digest('hex'),
      'com.interactivebuffoonery.organizedglitter', storedNative
    );
  }
  fixture.setRevokeStatus(503);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 0, 'the worker processes a bounded first page');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('orphangrant0001').state, 'active');
  grantDb.exec(`CREATE TRIGGER fail_test_orphan_reconcile BEFORE UPDATE OF state ON apple_oauth_grants
    WHEN NEW.id IN ('orphangrant0001', 'zzzorphan000001') AND NEW.state = 'revocation_pending'
    BEGIN SELECT RAISE(ABORT, 'disposable orphan reconciliation failure'); END;`);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 1, 'a failed orphan does not prevent later grants from queueing');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('orphangrant0001').state, 'active');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('zzzorphan000001').state, 'active');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('zzzzorphan00001').state, 'revocation_pending');
  grantDb.exec('DROP TRIGGER fail_test_orphan_reconcile');
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 3, 'the next pass retries every failed orphan grant');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('orphangrant0001').state, 'revocation_pending');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('zzzorphan000001').state, 'revocation_pending');
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM apple_oauth_grants WHERE id LIKE 'batchgrant%' AND state = 'active'").get().count, 101);
  fixture.setRevokeStatus(200);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.revoked, 3);
  assert.equal(grantDb.prepare('SELECT id FROM apple_oauth_grants WHERE user_id = ?').get(orphanUserId), undefined);

  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'aaawrapgrant001', orphanUserId,
      createHash('sha256').update('apple-test-wrap-orphan').digest('hex'),
      'com.interactivebuffoonery.organizedglitter', storedNative
    );
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.revoked, 1, 'the cursor wraps after processing the failed page');
  assert.equal(grantDb.prepare('SELECT id FROM apple_oauth_grants WHERE id = ?').get('aaawrapgrant001'), undefined);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.revoked, 0, 'the next page continues after the wrapped grants');

  for (let index = 0; index < 101; index += 1) {
    const id = `aaafail${String(index).padStart(8, '0')}`;
    addBatchGrant.run(
      id, orphanUserId,
      createHash('sha256').update(`apple-test-overflow-${index}`).digest('hex'),
      `overflow-test-client-${index}`, storedNative
    );
  }
  fixture.setRevokeStatus(503);
  grantDb.exec(`CREATE TRIGGER fail_test_orphan_reconcile_overflow BEFORE UPDATE OF state ON apple_oauth_grants
    WHEN NEW.id LIKE 'aaafail%' AND NEW.state = 'revocation_pending'
    BEGIN SELECT RAISE(ABORT, 'disposable orphan reconciliation overflow'); END;`);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 0, 'the first failed orphan page remains queued for retry');
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 0, 'the sweep keeps moving when saved retries fail again');
  grantDb.exec('DROP TRIGGER fail_test_orphan_reconcile_overflow');
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.failed, 10, 'saved retries stay bounded per worker pass');
  assert.equal(
    grantDb.prepare("SELECT state FROM apple_oauth_grants WHERE id = 'aaafail00000000'").get().state,
    'revocation_pending',
    'retry overflow does not discard the oldest failed orphan'
  );
  grantDb.exec("DELETE FROM apple_oauth_grants WHERE id LIKE 'aaafail%'");
  fixture.setRevokeStatus(200);

  result = await request(`${baseUrl}/api/collections/users/records`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      email: 'mixedrepair@localhost.test', username: 'mixedrepairfixture',
      password: 'mixedrepair-password-123', passwordConfirm: 'mixedrepair-password-123', verified: false,
    }),
  });
  assert.equal(result.status, 200);
  const mixedRepairId = result.body.id;
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('mixrepairapple1', usersCollection.id, mixedRepairId, 'apple', 'apple-test-mixedrepair');
  grantDb.prepare('INSERT INTO _externalAuths (id, collectionRef, recordRef, provider, providerId) VALUES (?, ?, ?, ?, ?)')
    .run('mixrepairdisco1', usersCollection.id, mixedRepairId, 'discord', 'disposable-mixed-repair');
  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'mixedrepairgrnt', mixedRepairId,
      createHash('sha256').update('apple-test-mixedrepair').digest('hex'),
      'com.interactivebuffoonery.organizedglitter', storedNative
    );
  result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'discord', code: 'mixed-repair', codeVerifier: 'disposable-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    }),
  });
  assert.equal(result.status, 200, 'another provider can repair an unverified account');
  assert.equal(result.body.record.id, mixedRepairId);
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE recordRef = ? AND provider = 'apple'").get(mixedRepairId).count, 0);
  fixture.setRevokeStatus(503);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
      method: 'POST', headers: adminHeaders,
    });
    if (grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('mixedrepairgrnt').state === 'revocation_pending') break;
  }
  assert.equal(result.body.failed, 1, 'repair through another provider queues the removed Apple grant');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE id = ?').get('mixedrepairgrnt').state, 'revocation_pending');
  fixture.setRevokeStatus(200);
  result = await request(`${baseUrl}/api/test/apple/revoke-pending`, {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(result.body.revoked, 1);
  assert.equal(grantDb.prepare('SELECT id FROM apple_oauth_grants WHERE id = ?').get('mixedrepairgrnt'), undefined);

  result = await request(`${baseUrl}/api/collections/users`, {
    method: 'PATCH', headers: adminHeaders,
    body: JSON.stringify({ oauth2: { enabled: false } }),
  });
  assert.equal(result.status, 200);
  result = await request(`${baseUrl}/api/auth/apple/native/readiness`);
  assert.deepEqual(result.body, { available: false }, 'disabled provider is not advertised');
  result = await signIn('disabled-provider');
  assert.equal(result.status, 503);

  for (let attempt = 0; attempt < 105; attempt++) {
    result = await request(`${baseUrl}/api/auth/apple/native`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (result.status === 429) break;
  }
  assert.equal(result.status, 429, 'POST exchange is rate limited');

  for (let attempt = 0; attempt < 105; attempt++) {
    result = await request(`${baseUrl}/api/auth/apple/native/readiness`);
    if (result.status === 429) break;
  }
  assert.equal(result.status, 429, 'GET readiness is rate limited');

  grantDb.prepare(`INSERT INTO apple_oauth_grants
    (id, user_id, provider_id_hash, client_id, ciphertext, key_version, state)
    VALUES (?, ?, ?, ?, ?, 'v1', 'active')`).run(
      'oldunverified01', unverifiedId,
      createHash('sha256').update('apple-test-unverified').digest('hex'),
      'com.interactivebuffoonery.organizedglitter', storedNative
    );
  result = await request(`${baseUrl}/api/collections/_externalAuths/records/unverifiedlink1`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.equal(result.status, 204, 'admin unlink of an unverified account is guarded');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(unverifiedId).state, 'revocation_pending');

  result = await request(`${baseUrl}/api/collections/_externalAuths/records/batchlink000000`, {
    method: 'DELETE', headers: adminHeaders,
  });
  assert.equal(result.status, 204, 'admin unlink of a verified account queues its grant');
  assert.equal(grantDb.prepare("SELECT state FROM apple_oauth_grants WHERE id = 'batchgrant00000'").get().state, 'revocation_pending');

  const verifiedHeaders = {
    Authorization: `Bearer ${verifiedToken}`, 'Content-Type': 'application/json',
  };
  const verifiedUnlinkProof = 'C'.repeat(43);
  result = await request(`${baseUrl}/api/auth/step-up/password`, {
    method: 'POST', headers: verifiedHeaders,
    body: JSON.stringify({
      action: 'unlink', password: 'verified-password-123',
      proof: verifiedUnlinkProof, targetProvider: 'apple',
    }),
  });
  assert.equal(result.status, 204, 'verified Apple user obtains an unlink proof');
  result = await request(`${baseUrl}/api/auth/external-auths/apple`, {
    method: 'DELETE', headers: verifiedHeaders,
    body: JSON.stringify({ proof: verifiedUnlinkProof }),
  });
  assert.equal(result.status, 204, 'verified Apple unlink queues its grant in nested transactions');
  assert.equal(grantDb.prepare('SELECT state FROM apple_oauth_grants WHERE user_id = ?').get(verifiedId).state, 'revocation_pending');
  assert.equal(grantDb.prepare("SELECT COUNT(*) AS count FROM _externalAuths WHERE recordRef = ? AND provider = 'apple'").get(verifiedId).count, 0);

  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({
    command: 'node scripts/test-native-apple-auth.mjs',
    status: 'passed',
    providerClaims: 'fixture; live Apple signature verification remains a release gate',
  }, null, 2) + '\n');
  console.log(`Native Apple auth disposable flow passed; fixture: ${runDir}`);
} finally {
  try {
    grantDb?.close();
  } finally {
    await fixture.close();
  }
}
