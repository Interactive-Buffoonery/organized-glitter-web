import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const requireFromAstro = createRequire(require.resolve('astro/package.json'));
const CachePolicy = requireFromAstro('http-cache-semantics');
const url = 'https://images.example.test/image.webp';

function request(headers = {}) {
  return { url, method: 'GET', headers: { host: 'images.example.test', ...headers } };
}

function policy(headers, options, originalRequest = request()) {
  return new CachePolicy(originalRequest, { status: 200, headers }, options);
}

function assertRevalidation(cache, incoming) {
  assert.equal(cache.satisfiesWithoutRevalidation(incoming), false);
  const result = cache.evaluateRequest(incoming);
  assert.equal(result.response, undefined);
  assert.equal(result.revalidation?.synchronous, true);
}

test('client stale directives cannot bypass response reuse restrictions', async t => {
  const restricted = [
    { 'cache-control': 'max-age=3600', 'set-cookie': 'session=example' },
    { 'cache-control': 'max-age=3600, proxy-revalidate' },
    { 'cache-control': 'max-age=3600, no-cache' },
    { 'cache-control': 'max-age=3600, no-store' },
    { 'cache-control': 'max-age=3600, private' },
  ];
  for (const headers of restricted) {
    for (const directive of ['max-stale', 'max-stale=86400']) {
      await t.test(`${JSON.stringify(headers)} with ${directive}`, () => {
        assertRevalidation(policy(headers), request({ 'cache-control': directive }));
      });
    }
  }
});

test('stale-while-revalidate cannot bypass response reuse restrictions', () => {
  const cache = policy({
    'cache-control': 'no-cache, max-age=0, stale-while-revalidate=3600',
  });
  assertRevalidation(cache, request());
});

test('all wildcard Vary forms forbid reuse and have zero freshness', async t => {
  for (const vary of ['*', '* ', ' *', '*,', 'accept, *', '\t*, accept\t']) {
    await t.test(JSON.stringify(vary), () => {
      const cache = policy({ 'cache-control': 'public, max-age=3600', vary });
      assertRevalidation(cache, request({ 'cache-control': 'max-stale' }));
      assert.equal(cache.maxAge(), 0);
      assert.equal(cache.timeToLive(), 0);
    });
  }
});

test('inherited header values cannot impersonate an own Vary header', () => {
  const cache = policy(
    { 'cache-control': 'public, max-age=3600', vary: 'x-reader' },
    undefined,
    request({ 'x-reader': 'alice' })
  );
  const incoming = request();
  incoming.headers = Object.assign(Object.create({ 'x-reader': 'alice' }), incoming.headers);
  assertRevalidation(cache, incoming);

  const original = request();
  original.headers = Object.assign(Object.create({ 'x-reader': 'alice' }), original.headers);
  assertRevalidation(
    policy({ 'cache-control': 'public, max-age=3600', vary: 'x-reader' }, undefined, original),
    request({ 'x-reader': 'alice' })
  );
});

test('prototype-named Vary fields compare only actual header values', () => {
  const headers = { 'cache-control': 'public, max-age=3600', vary: 'constructor' };
  const cache = policy(headers, undefined, request({ constructor: 'alice' }));
  assertRevalidation(cache, request());
  assertRevalidation(cache, request({ constructor: 'bob' }));
  assert.equal(cache.satisfiesWithoutRevalidation(request({ constructor: 'alice' })), true);
  assert.equal(policy(headers).satisfiesWithoutRevalidation(request()), true);
});

test('normal Vary matching and absent headers retain their semantics', () => {
  const cache = policy(
    { 'cache-control': 'public, max-age=3600', vary: 'Accept, x-optional' },
    undefined,
    request({ accept: 'image/webp' })
  );
  assert.equal(cache.satisfiesWithoutRevalidation(request({ accept: 'image/webp' })), true);
  assertRevalidation(cache, request({ accept: 'image/png' }));
  assertRevalidation(cache, request({ accept: 'image/webp', 'x-optional': 'present' }));
});

test('origin errors do not bypass Vary or response reuse restrictions', async t => {
  const restricted = [
    { vary: 'accept, *' },
    { vary: '* ' },
    { 'set-cookie': 'session=example' },
    { 'cache-control': 'no-cache, stale-if-error=3600' },
    { 'cache-control': 'no-store, stale-if-error=3600' },
    { 'cache-control': 'private, stale-if-error=3600' },
    { 'cache-control': 'proxy-revalidate, stale-if-error=3600' },
    { 'cache-control': 'must-revalidate, stale-if-error=3600' },
  ];
  for (const headers of restricted) {
    await t.test(JSON.stringify(headers), () => {
      const cache = policy({ 'cache-control': 'max-age=0, stale-if-error=3600', ...headers });
      const result = cache.revalidatedPolicy(request(), { status: 500, headers: {} });
      assert.equal(result.matches, false);
      assert.equal(result.modified, true);
      assert.notEqual(result.policy, cache);
    });
  }
  const cache = policy(
    { 'cache-control': 'public, max-age=0, stale-if-error=3600', vary: 'accept' },
    undefined,
    request({ accept: 'image/webp' })
  );
  assert.equal(
    cache.revalidatedPolicy(request({ accept: 'image/png' }), { status: 500, headers: {} }).matches,
    false
  );
  const allowed = cache.revalidatedPolicy(request({ accept: 'image/webp' }), {
    status: 500,
    headers: {},
  });
  assert.equal(allowed.matches, true);
  assert.equal(allowed.modified, false);
  assert.equal(allowed.policy, cache);
});

test('ordinary stale reuse and explicitly shareable cookies still work', () => {
  const incoming = request({ 'cache-control': 'max-stale=86400' });
  assert.equal(
    policy({ 'cache-control': 'public, max-age=0' }).satisfiesWithoutRevalidation(incoming),
    true
  );
  for (const permission of ['public', 'immutable']) {
    assert.equal(
      policy({
        'cache-control': `${permission}, max-age=3600`,
        'set-cookie': 'session=example',
      }).satisfiesWithoutRevalidation(request()),
      true
    );
  }
  assert.equal(
    policy(
      { 'cache-control': 'private, max-age=3600', 'set-cookie': 'session=example' },
      { shared: false }
    ).satisfiesWithoutRevalidation(request()),
    true
  );
});
