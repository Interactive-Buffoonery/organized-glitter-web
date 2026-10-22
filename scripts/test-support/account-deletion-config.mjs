import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startAppleFixture } from './apple/fixture.mjs';

export async function testErasureConfiguration(runDir) {
  const directory = path.join(runDir, 'configuration');
  mkdirSync(directory);
  const source = readFileSync('pb_hooks/account_deletion_posthog.js', 'utf8');
  assert.equal(
    source.split('$http.send(').length,
    2,
    'replace the sole transport, preserve production config parsing'
  );
  const worker = path.join(directory, 'account_deletion_posthog.js');
  writeFileSync(
    worker,
    `const disabledTransport = { send() {
    $app.store().set('posthog_test_requests', ($app.store().get('posthog_test_requests') || 0) + 1);
    throw new Error('Test transport is disabled.');
  }};\n` + source.replace('$http.send(', 'disabledTransport.send(')
  );
  const hook = path.join(directory, 'zz_config_test.pb.js');
  writeFileSync(
    hook,
    `onBootstrap(e => { e.next(); cronRemove('account_deletion_posthog'); });
    routerAdd('POST', '/api/test/config', e => {
      require(__hooks + '/account_deletion_posthog.js').processPending(e.app);
      return e.json(200, { attempts: e.app.store().get('posthog_test_requests') || 0 });
    }, $apis.requireSuperuserAuth());`
  );
  const valid = {
    POSTHOG_ERASURE_HOST: 'https://us.posthog.com',
    POSTHOG_ERASURE_PROJECT_ID: '123',
    POSTHOG_ERASURE_API_KEY: 'disposable-key',
  };
  const cases = [
    { POSTHOG_ERASURE_HOST: 'http://127.0.0.1:9' },
    { POSTHOG_ERASURE_HOST: 'https://untrusted.invalid' },
    { POSTHOG_ERASURE_HOST: 'https://us.posthog.com.untrusted.invalid' },
    { POSTHOG_ERASURE_PROJECT_ID: '0' },
    { POSTHOG_ERASURE_PROJECT_ID: '12a' },
    { POSTHOG_ERASURE_API_KEY: 'invalid key' },
    { POSTHOG_ERASURE_API_KEY: 'invalid\nkey' },
  ];
  for (const overrides of [...cases, {}]) {
    const invalid = Object.keys(overrides).length > 0;
    const fixture = await startAppleFixture({
      extraHooks: [worker, hook],
      testEnv: { ...valid, ...overrides },
    });
    try {
      const request = async (route, body, method = 'POST', token = '') => {
        const response = await fetch(fixture.baseUrl + route, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        assert.ok(response.ok, `local configuration fixture HTTP ${response.status}`);
        return response.json().catch(() => null);
      };
      const auth = await request('/api/collections/_superusers/auth-with-password', {
        identity: fixture.adminEmail,
        password: fixture.adminPassword,
      });
      const token = auth.token;
      await request(
        '/api/collections/import',
        {
          collections: JSON.parse(readFileSync('docs/pocketbase/collections.schema.json')),
          deleteMissing: false,
        },
        'PUT',
        token
      );
      const job = await request(
        '/api/collections/account_deletion_jobs/records',
        { user_id: 'syntheticconfig', source_kind: 'legacy', posthog_status: 'pending' },
        'POST',
        token
      );
      const result = await request('/api/test/config', {}, 'POST', token);
      const current = await request(
        `/api/collections/account_deletion_jobs/records/${job.id}`,
        undefined,
        'GET',
        token
      );
      assert.equal(
        result.attempts,
        invalid ? 0 : 1,
        'invalid nonempty configuration performs zero network attempts'
      );
      assert.equal(current.posthog_status, invalid ? 'blocked' : 'pending');
      assert.equal(current.last_error, invalid ? 'configuration' : 'transport');
    } finally {
      await fixture.close();
    }
  }
}
