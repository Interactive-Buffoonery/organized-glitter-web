import { ClientResponseError } from 'pocketbase';
import { describe, expect, it, vi } from 'vitest';

import { defaultQueryRetry, queryClient } from '@/lib/queryClient';

const responseError = (status: number, extra: Record<string, unknown> = {}) =>
  new ClientResponseError({ status, message: `status ${status}`, data: {}, ...extra });

describe('queryClient mutation defaults', () => {
  it('does not retry mutations with ambiguous outcomes', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('queryClient query retry defaults', () => {
  it('uses the shared retry policy for queries', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(defaultQueryRetry);
  });

  it.each([
    ['a dropped connection (status 0)', responseError(0)],
    ['a server error (503)', responseError(503)],
    ['an unlisted server error (501)', responseError(501)],
    ['rate limiting (429)', responseError(429)],
    ['a fetch failure', new TypeError('Failed to fetch')],
  ])('retries %s', (_label, error) => {
    expect(defaultQueryRetry(0, error)).toBe(true);
    expect(defaultQueryRetry(1, error)).toBe(true);
  });

  it.each([
    ['a cancelled request', responseError(0, { isAbort: true })],
    ['a fetch abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ['not found (404)', responseError(404)],
    ['unauthorized (401)', responseError(401)],
    ['a validation error (400)', responseError(400)],
    ['an unclassified error', new Error('Unexpected value')],
  ])('does not retry %s', (_label, error) => {
    expect(defaultQueryRetry(0, error)).toBe(false);
  });

  it('does not retry unclassified errors while offline', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(defaultQueryRetry(0, new Error('Unexpected value'))).toBe(false);
      expect(defaultQueryRetry(0, new TypeError('Failed to fetch'))).toBe(true);
      expect(defaultQueryRetry(0, responseError(0))).toBe(true);
    } finally {
      online.mockRestore();
    }
  });

  it('stops after two retries', () => {
    expect(defaultQueryRetry(2, responseError(503))).toBe(false);
  });
});
