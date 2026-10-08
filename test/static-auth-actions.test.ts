import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const script = () => readFileSync('public/js/static-auth-actions.js', 'utf8');

const session = (expiresAt: number) => {
  const payload = btoa(JSON.stringify({ exp: expiresAt, id: 'account-1' }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return JSON.stringify({
    token: `e30.${payload}.fixture`,
    record: { id: 'account-1' },
  });
};

const guestActions = () => document.querySelector<HTMLElement>('[data-static-auth="guest"]');
const memberActions = () => document.querySelector<HTMLElement>('[data-static-auth="member"]');
const run = () => new Function(script())();

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `
    <header>
      <div data-static-auth="guest"><a href="/login">Login</a></div>
      <div data-static-auth="member" hidden><a href="/overview">Open app</a></div>
    </header>
  `;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('static auth actions', () => {
  it.each(['landing.html', 'privacy.html', 'terms.html'])(
    'loads the auth action control on %s',
    file => {
      expect(readFileSync(file, 'utf8')).toContain(
        '<script src="/js/static-auth-actions.js?v=1" defer></script>'
      );
    }
  );

  it('shows Open app for a current PocketBase session', () => {
    localStorage.setItem('pocketbase_auth', session(Math.floor(Date.now() / 1000) + 60));

    run();

    expect(guestActions()).toHaveAttribute('hidden');
    expect(memberActions()).not.toHaveAttribute('hidden');
  });

  it.each([
    ['missing session', null],
    ['malformed storage', '{broken'],
    ['missing record', JSON.stringify({ token: 'e30.e30.fixture' })],
    ['malformed token', JSON.stringify({ token: 'not-a-jwt', record: { id: 'account-1' } })],
    ['expired session', session(Math.floor(Date.now() / 1000) - 60)],
  ])('keeps guest actions for a %s', (_label, value) => {
    if (value) localStorage.setItem('pocketbase_auth', value);

    run();

    expect(guestActions()).not.toHaveAttribute('hidden');
    expect(memberActions()).toHaveAttribute('hidden');
  });

  it('updates when another tab signs out and back in', () => {
    const currentSession = session(Math.floor(Date.now() / 1000) + 60);
    localStorage.setItem('pocketbase_auth', currentSession);
    run();

    localStorage.removeItem('pocketbase_auth');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'pocketbase_auth',
        newValue: null,
        storageArea: localStorage,
      })
    );
    expect(guestActions()).not.toHaveAttribute('hidden');

    localStorage.setItem('pocketbase_auth', currentSession);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'pocketbase_auth',
        newValue: currentSession,
        storageArea: localStorage,
      })
    );
    expect(memberActions()).not.toHaveAttribute('hidden');
  });

  it('fails closed when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    run();

    expect(guestActions()).not.toHaveAttribute('hidden');
    expect(memberActions()).toHaveAttribute('hidden');
  });
});
