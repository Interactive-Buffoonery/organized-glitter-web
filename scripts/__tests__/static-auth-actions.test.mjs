import { readFileSync } from 'node:fs';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectStaticAuthActions } from '../static-pages.mjs';

// Fixed synthetic JWTs: exp = 2000000000 and 1000000000 seconds respectively.
// These are not credentials and deliberately have no valid signature.
const currentJwt = 'e30.eyJleHAiOjIwMDAwMDAwMDB9.fixture';
const expiredJwt = 'e30.eyJleHAiOjEwMDAwMDAwMDB9.fixture';
const session = (token = currentJwt, field = 'record') =>
  JSON.stringify({ token, [field]: { id: 'account-1' } });
const markup = `<head><!-- og-static-auth-actions --></head><body>
  <div data-static-auth="guest"><a href="/login">Login</a></div>
  <div data-static-auth="member" hidden><a href="/overview">Open app</a></div>
</body>`;
const instances = [];

async function load(value = null, blocked = false) {
  const requests = [];
  const errors = [];
  class ScriptLoader extends ResourceLoader {
    fetch(url) {
      requests.push(url);
      return Promise.resolve(readFileSync('public/js/static-auth-actions.js'));
    }
  }
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(injectStaticAuthActions(markup), {
    url: 'https://app.invalid/',
    runScripts: 'dangerously',
    resources: new ScriptLoader(),
    virtualConsole,
    beforeParse(window) {
      vi.spyOn(window.Date, 'now').mockReturnValue(1500000000000);
      if (value !== null) window.localStorage.setItem('pocketbase_auth', value);
      if (blocked) {
        vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('blocked');
        });
      }
    },
  });
  instances.push(dom);
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  expect(errors).toEqual([]);
  expect(requests).toEqual(['https://app.invalid/js/static-auth-actions.js?v=1']);
  return dom.window;
}

function expectMember(window, member) {
  expect(window.document.querySelector('[data-static-auth="guest"]').hidden).toBe(member);
  expect(window.document.querySelector('[data-static-auth="member"]').hidden).toBe(!member);
}

afterEach(() => {
  vi.restoreAllMocks();
  instances.splice(0).forEach(dom => dom.window.close());
});

describe('static auth actions', () => {
  it.each(['landing.html', 'privacy.html', 'terms.html'])(
    'includes the deferred external script on %s',
    file => {
      const html = injectStaticAuthActions(readFileSync(file, 'utf8'));
      const dom = new JSDOM(html);
      instances.push(dom);
      const scripts = dom.window.document.querySelectorAll(
        'script[src="/js/static-auth-actions.js?v=1"]'
      );
      expect(scripts).toHaveLength(1);
      expect(scripts[0].defer).toBe(true);
      expect(html).not.toContain('<!-- og-static-auth-actions -->');
    }
  );

  it.each(['record', 'model'])('shows Open app with the %s session shape', async field => {
    expectMember(await load(session(currentJwt, field)), true);
  });

  it.each([
    ['missing session', null],
    ['malformed storage', '{broken'],
    ['missing record', JSON.stringify({ token: currentJwt })],
    ['malformed token', session('not-a-jwt')],
    ['expired session', session(expiredJwt)],
  ])('keeps guest actions for a %s', async (_label, value) => {
    expectMember(await load(value), false);
  });

  it('updates when another tab signs out and back in', async () => {
    const window = await load(session());
    window.localStorage.removeItem('pocketbase_auth');
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'pocketbase_auth' }));
    expectMember(window, false);
    window.localStorage.setItem('pocketbase_auth', session());
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'pocketbase_auth' }));
    expectMember(window, true);
  });

  it('refreshes an expired session after a cached page is restored', async () => {
    const window = await load(session());
    window.localStorage.setItem('pocketbase_auth', session(expiredJwt));
    window.dispatchEvent(new window.Event('pageshow'));
    expectMember(window, false);
  });

  it('uses guest actions when browser storage is unavailable', async () => {
    expectMember(await load(null, true), false);
  });
});
