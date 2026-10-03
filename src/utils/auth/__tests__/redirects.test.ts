import { describe, expect, it } from 'vitest';
import { extractAuthRedirectState, resolveAuthRedirectDestination } from '../redirects';

describe('auth redirects', () => {
  it('resolves a valid pathname with query params', () => {
    expect(
      resolveAuthRedirectDestination({
        from: {
          pathname: '/dashboard',
          search: '?status=wishlist',
          hash: '',
        },
      })
    ).toBe('/dashboard?status=wishlist');
  });

  it('resolves a valid pathname with a hash fragment', () => {
    expect(
      resolveAuthRedirectDestination({
        from: {
          pathname: '/projects/abc123',
          search: '',
          hash: '#notes',
        },
      })
    ).toBe('/projects/abc123#notes');
  });

  it('falls back to overview when redirect state is missing', () => {
    expect(resolveAuthRedirectDestination(undefined)).toBe('/overview');
  });

  it('falls back to overview when redirect state is malformed', () => {
    expect(
      resolveAuthRedirectDestination({
        from: {
          pathname: '/dashboard',
          search: 'status=wishlist',
        },
      })
    ).toBe('/overview');
  });

  it('falls back to overview when redirect state is unsafe', () => {
    expect(
      resolveAuthRedirectDestination({
        from: {
          pathname: 'https://evil.com',
        },
      })
    ).toBe('/overview');

    expect(
      resolveAuthRedirectDestination({
        from: {
          pathname: '//evil.com',
        },
      })
    ).toBe('/overview');
  });

  it('returns sanitized redirect state for safe relative destinations', () => {
    expect(
      extractAuthRedirectState({
        from: {
          pathname: '/dashboard',
          search: '?status=wishlist',
          hash: '',
          ignored: 'value',
        },
      })
    ).toEqual({
      from: {
        pathname: '/dashboard',
        search: '?status=wishlist',
        hash: '',
      },
    });

    expect(
      extractAuthRedirectState({
        from: {
          pathname: '//evil.com',
        },
      })
    ).toBeUndefined();
  });

  it('keeps the expiry reason with a safe return route', () => {
    expect(
      extractAuthRedirectState({
        from: { pathname: '/projects/new', search: '?craft=coloring' },
        sessionExpired: true,
      })
    ).toEqual({
      from: { pathname: '/projects/new', search: '?craft=coloring' },
      sessionExpired: true,
    });
  });
});
