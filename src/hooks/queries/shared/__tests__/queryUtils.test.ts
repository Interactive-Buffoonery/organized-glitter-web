import { describe, expect, it } from 'vitest';
import { queryFreshness, userScopedQueryOptions } from '../queryUtils';

describe('queryFreshness', () => {
  it.each([
    ['standard', 10 * 60 * 1000, 10 * 60 * 1000],
    ['frequent', 5 * 60 * 1000, 10 * 60 * 1000],
    ['interactive', 2 * 60 * 1000, 10 * 60 * 1000],
    ['activity', 30 * 1000, 5 * 60 * 1000],
  ] as const)('returns only cache timing for the %s profile', (profile, staleTime, gcTime) => {
    expect(queryFreshness(profile)).toEqual({ staleTime, gcTime });
  });

  it('returns a copy callers cannot use to change the shared profile', () => {
    queryFreshness('standard').staleTime = 0;

    expect(queryFreshness('standard').staleTime).toBe(10 * 60 * 1000);
  });
});

describe('userScopedQueryOptions', () => {
  it('applies the named freshness profile', () => {
    const options = userScopedQueryOptions({
      queryKey: ['example'],
      queryFn: async () => [],
      userId: 'user-123',
      freshness: 'interactive',
    });

    expect(options).toMatchObject(queryFreshness('interactive'));
    expect(options.enabled).toBe(true);
  });

  it('leaves focus and reconnect refetching to the query client', () => {
    const options = userScopedQueryOptions({
      queryKey: ['example'],
      queryFn: async () => [],
      userId: 'user-123',
      freshness: 'standard',
    });

    expect(options).not.toHaveProperty('refetchOnWindowFocus');
    expect(options).not.toHaveProperty('refetchOnReconnect');
  });
});
