import { describe, expect, it } from 'vitest';
import { extractAuthRedirectState, resolveAuthRedirectDestination } from '../redirects';

describe('auth redirects', () => {
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
});
