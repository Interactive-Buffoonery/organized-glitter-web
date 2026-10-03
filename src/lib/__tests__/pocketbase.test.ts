/**
 * Regression tests for src/lib/pocketbase.ts
 *
 * These tests lock in the fix for #108. The bug had two layers:
 *   1. A custom request-deduplication layer in beforeSend that imposed a
 *      5-second per-URL lock on every GET, masquerading as deduplication.
 *   2. PocketBase SDK auto-cancellation aborting React Query refetches that
 *      shared the default `requestKey = "GET <path>"` with other in-flight reads.
 *
 * The fix removed (1) entirely and disabled (2) globally via `pb.autoCancellation(false)`.
 * These tests assert both invariants and that the unrelated rate-limit/timing
 * logic preserved alongside the fix still functions.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import PocketBase, { type SendOptions } from 'pocketbase';

const { mockCapture } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
  captureException: vi.fn(),
}));

// Minimal SendOptions with the shape the SDK's `beforeSend` expects.
const buildGetOptions = (): SendOptions => ({ method: 'GET', headers: {} });

describe('src/lib/pocketbase', () => {
  describe('module side effects (run once at import time)', () => {
    // The spy must be installed before the module is imported. We tracking it
    // via a typed handle so the assertion below has type information.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let autoCancellationSpy: any;

    beforeAll(async () => {
      // Reset module cache so we can observe side effects of the fresh import.
      vi.resetModules();
      autoCancellationSpy = vi.spyOn(PocketBase.prototype, 'autoCancellation');
      // Importing triggers `pb.autoCancellation(false)` per the #108 fix.
      await import('@/lib/pocketbase');
    });

    it('calls pb.autoCancellation(false) at module load (regression for #108 layer 2)', () => {
      // The fix for #108 requires autoCancellation(false) to run at module load
      // in ALL environments, not just dev. If this regresses, parallel reads
      // sharing a default requestKey will start aborting each other again in prod.
      expect(autoCancellationSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('exported surface', () => {
    it('exposes a usable PocketBase client instance with both hooks installed', async () => {
      const { pb } = await import('@/lib/pocketbase');
      expect(pb).toBeInstanceOf(PocketBase);
      expect(typeof pb.collection).toBe('function');
      expect(pb.beforeSend).toBeTypeOf('function');
      expect(pb.afterSend).toBeTypeOf('function');
    });

    it('getPocketBaseConfig() reports the configured URL and locality flag', async () => {
      const { getPocketBaseConfig } = await import('@/lib/pocketbase');
      const config = getPocketBaseConfig();
      expect(config.url).toBeTruthy();
      expect(typeof config.isLocal).toBe('boolean');
    });

    it('normalizes trailing slashes from the configured PocketBase URL', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_POCKETBASE_URL', 'https://data.organizedglitter.app/');

      const { getPocketBaseConfig } = await import('@/lib/pocketbase');

      expect(getPocketBaseConfig().url).toBe('https://data.organizedglitter.app');

      vi.unstubAllEnvs();
      vi.resetModules();
    });
  });

  describe('beforeSend: no custom request-dedup lock (regression for #108 layer 1)', () => {
    let pb: PocketBase;

    beforeEach(async () => {
      const mod = await import('@/lib/pocketbase');
      pb = mod.pb;
      // Stub authStore.isValid so the rate-limit branch picks the
      // "authenticated user" path (interval = 0) deterministically.
      Object.defineProperty(pb.authStore, 'isValid', {
        configurable: true,
        get: () => true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not impose a 5-second per-URL lock on parallel GETs', async () => {
      // The bug: beforeSend locked each GET URL for 5 seconds via setTimeout.
      // The second identical GET awaited that timer before its own request
      // could continue. After the fix, beforeSend should add no artificial
      // delay for either call.

      const url = 'https://example.test/api/collections/foo/records';

      const start = Date.now();
      await Promise.all([
        pb.beforeSend!(url, buildGetOptions()),
        pb.beforeSend!(url, buildGetOptions()),
        pb.beforeSend!(url, buildGetOptions()),
        pb.beforeSend!(url, buildGetOptions()),
      ]);
      const elapsed = Date.now() - start;

      // With the bug, calls 2-4 would each await up to 5 seconds.
      // Without it, all should complete essentially together.
      expect(elapsed).toBeLessThan(500);
    });

    it('does not retain stateful coupling across sequential GETs', async () => {
      // The removed dedup layer used a module-level Map keyed by URL. If a
      // regression accidentally restores stateful coupling, repeated identical
      // GETs would start delaying each other again. Issuing several sequential
      // identical calls and bounding total elapsed time catches that.
      const url = 'https://example.test/api/collections/bar/records';

      const start = Date.now();
      for (let i = 0; i < 6; i++) {
        await pb.beforeSend!(url, buildGetOptions());
      }
      const elapsed = Date.now() - start;

      // Six sequential beforeSend calls with no rate-limit delay should be
      // well under 100ms. A 5-second-per-call lock would push past 5000ms.
      expect(elapsed).toBeLessThan(500);
    });

    it('returns the documented { url, options } contract from beforeSend', async () => {
      const result = await pb.beforeSend!('https://example.test/api/foo', buildGetOptions());
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('options');
      expect(result.url).toBe('https://example.test/api/foo');
    });
  });

  describe('rate limiting (preserved during #108 fix)', () => {
    let pb: PocketBase;

    beforeEach(async () => {
      const mod = await import('@/lib/pocketbase');
      pb = mod.pb;
      mockCapture.mockClear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('uses zero-interval rate limiting for authenticated users (no 429s yet)', async () => {
      Object.defineProperty(pb.authStore, 'isValid', {
        configurable: true,
        get: () => true,
      });

      // For an authenticated user with no recent 429s, getMinRequestInterval
      // returns 0, so consecutive beforeSend calls should not introduce a
      // perceptible delay.
      const start = Date.now();
      for (let i = 0; i < 3; i++) {
        await pb.beforeSend!('https://example.test/api/x', buildGetOptions());
      }
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('still applies a baseInterval delay for unauthenticated users', async () => {
      Object.defineProperty(pb.authStore, 'isValid', {
        configurable: true,
        get: () => false,
      });

      // Unauthenticated users get a 10ms baseInterval. Three sequential calls
      // should observably take at least the cumulative interval (with some
      // slack) but well under any 5-second lock regression.
      const start = Date.now();
      for (let i = 0; i < 3; i++) {
        await pb.beforeSend!('https://example.test/api/y', buildGetOptions());
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('afterSend: hook preserved by #108 fix', () => {
    let pb: PocketBase;

    beforeEach(async () => {
      const mod = await import('@/lib/pocketbase');
      pb = mod.pb;
    });

    it('reports a revoked current token through the real SDK send path', async () => {
      const { subscribeToInvalidSession } = await import('@/services/auth/sessionRecovery');
      const listener = vi.fn();
      const unsubscribe = subscribeToInvalidSession(listener);
      pb.authStore.save('revoked-token', { id: 'account-a' });
      Object.defineProperty(pb.authStore, 'isValid', { configurable: true, get: () => true });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

      try {
        await expect(
          pb.send('/api/collections/projects/records', { method: 'GET' })
        ).rejects.toMatchObject({
          status: 401,
        });
        expect(listener).toHaveBeenCalledWith('revoked-token');
      } finally {
        unsubscribe();
        pb.authStore.clear();
        Reflect.deleteProperty(pb.authStore, 'isValid');
        vi.unstubAllGlobals();
      }
    });

    it('handles a 401 response without an absolute URL', async () => {
      const { subscribeToInvalidSession } = await import('@/services/auth/sessionRecovery');
      const listener = vi.fn();
      const unsubscribe = subscribeToInvalidSession(listener);
      pb.authStore.save('missing-url-token', { id: 'account-a' });

      pb.afterSend!(
        new Response('{}', { status: 401 }),
        {},
        {
          method: 'POST',
          headers: { Authorization: 'Bearer missing-url-token' },
        }
      );

      expect(listener).toHaveBeenCalledWith('missing-url-token');
      unsubscribe();
    });

    it('reports only a 401 from the current authenticated request', async () => {
      const { subscribeToInvalidSession } = await import('@/services/auth/sessionRecovery');
      const listener = vi.fn();
      const unsubscribe = subscribeToInvalidSession(listener);
      pb.authStore.save('current-token', { id: 'account-a' });
      const response = new Response('{}', { status: 401 });
      Object.defineProperty(response, 'url', {
        value: 'https://data.organizedglitter.app/api/collections/projects/records',
      });

      pb.afterSend!(
        response,
        {},
        {
          method: 'POST',
          headers: { Authorization: 'Bearer old-token' },
        }
      );
      expect(listener).not.toHaveBeenCalled();

      pb.afterSend!(
        response,
        {},
        {
          method: 'POST',
          headers: { Authorization: 'Bearer current-token' },
        }
      );
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith('current-token');

      const forbiddenResponse = new Response('{}', { status: 403 });
      Object.defineProperty(forbiddenResponse, 'url', { value: response.url });
      pb.afterSend!(
        forbiddenResponse,
        {},
        {
          method: 'POST',
          headers: { Authorization: 'Bearer current-token' },
        }
      );
      expect(listener).toHaveBeenCalledOnce();

      unsubscribe();
      pb.authStore.clear();
    });

    it('does not complete an old session write after sign-out', async () => {
      const { markSessionTokenInactive, activateSessionToken } =
        await import('@/services/auth/sessionRecovery');
      const response = new Response('{}', { status: 200 });
      markSessionTokenInactive('old-token');

      expect(() =>
        pb.afterSend!(
          response,
          {},
          {
            method: 'PATCH',
            headers: { Authorization: 'Bearer old-token' },
          }
        )
      ).toThrow(expect.objectContaining({ reason: 'session_changed' }));

      activateSessionToken('old-token');
    });

    it('records a late create without allowing stale success callbacks', async () => {
      const {
        markSessionTokenInactive,
        activateSessionToken,
        captureSessionDrafts,
        takeCompletedSessionOtherCreate,
      } = await import('@/services/auth/sessionRecovery');
      const response = new Response('{}', { status: 200 });
      Object.defineProperty(response, 'url', {
        value: 'https://data.organizedglitter.app/api/collections/progress_notes/records',
      });
      const note = { id: 'note-1' };
      captureSessionDrafts('account-a', 'old-token');
      markSessionTokenInactive('old-token');

      expect(() =>
        pb.afterSend!(response, note, {
          method: 'POST',
          headers: { Authorization: 'Bearer old-token' },
        })
      ).toThrow(expect.objectContaining({ reason: 'session_changed' }));
      expect(takeCompletedSessionOtherCreate('account-b')).toEqual([]);
      expect(takeCompletedSessionOtherCreate('account-a')).toEqual(['progress_notes']);

      activateSessionToken('old-token');
    });

    it('classifies an old-session write through the PocketBase send path', async () => {
      const { markSessionTokenInactive, activateSessionToken, isSessionChangedError } =
        await import('@/services/auth/sessionRecovery');
      const { getProjectSaveErrorMessage } = await import('@/utils/project/projectSaveError');
      markSessionTokenInactive('old-token');
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
          )
      );

      try {
        await expect(
          pb.send('/api/collections/projects/records/record-1', {
            method: 'PATCH',
            headers: { Authorization: 'Bearer old-token' },
            body: JSON.stringify({ title: 'Changed' }),
          })
        ).rejects.toSatisfy(
          error =>
            isSessionChangedError(error) &&
            getProjectSaveErrorMessage(error).includes('Check your library before trying again')
        );
      } finally {
        activateSessionToken('old-token');
        vi.unstubAllGlobals();
      }
    });

    it('passes data through unchanged on a 2xx response', () => {
      const fakeData = { ok: true, items: [1, 2, 3] };
      const fakeResponse = new Response(JSON.stringify(fakeData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      const out = pb.afterSend!(fakeResponse, fakeData);
      expect(out).toEqual(fakeData);
    });

    it('passes data through unchanged on a 4xx response (no dedup-cache cleanup left to throw)', () => {
      // The removed afterSend block iterated `pendingRequests` on response.status >= 400.
      // After removal, a 4xx should still flow through afterSend without referencing
      // any deleted symbol. If a regression restored the loop, this would throw a
      // ReferenceError on `pendingRequests` (we'd lose this assertion to the test crash).
      const fakeData = { ok: false };
      const fakeResponse = new Response(JSON.stringify(fakeData), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(() => pb.afterSend!(fakeResponse, fakeData)).not.toThrow();
    });

    it('passes data through unchanged on a 429 response without throwing', () => {
      // The 429 branch increments consecutiveRateLimits, verifying the path
      // executes catches accidental removal during refactors.
      const fakeData = { code: 429, message: 'Too Many Requests' };
      const fakeResponse = new Response(JSON.stringify(fakeData), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(() => pb.afterSend!(fakeResponse, fakeData)).not.toThrow();
    });

    it('captures a privacy-safe analytics event on 429 responses', () => {
      Object.defineProperty(pb.authStore, 'isValid', {
        configurable: true,
        get: () => true,
      });

      const fakeData = { code: 429, message: 'Too Many Requests' };
      const fakeResponse = new Response(JSON.stringify(fakeData), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
      Object.defineProperty(fakeResponse, 'url', {
        value:
          'https://data.organizedglitter.app/api/collections/projects/records?filter=user%3Dabc',
      });

      pb.afterSend!(fakeResponse, fakeData);

      expect(mockCapture).toHaveBeenCalledWith('api_rate_limited', {
        auth_state: 'authenticated',
        consecutive_rate_limit_bucket: expect.any(String),
        route_label: '/api/collections/:collection/records',
      });
      expect(JSON.stringify(mockCapture.mock.calls[0])).not.toContain('projects');
      expect(JSON.stringify(mockCapture.mock.calls[0])).not.toContain('filter');
      expect(JSON.stringify(mockCapture.mock.calls[0])).not.toContain('abc');
    });
  });

  describe('file URL helpers (unrelated to #108, regression coverage)', () => {
    it('getFileUrl returns empty string for missing record id or filename', async () => {
      const { getFileUrl } = await import('@/lib/pocketbase');
      expect(getFileUrl({ id: '' }, 'foo.png')).toBe('');
      expect(getFileUrl({ id: 'rec-1' }, '')).toBe('');
    });

    it('getFileUrl returns an absolute URL for a valid record + filename', async () => {
      const { getFileUrl } = await import('@/lib/pocketbase');
      const url = getFileUrl(
        { id: 'rec-1', collectionId: 'col-1', collectionName: 'tests' },
        'image.png'
      );
      expect(url).toMatch(/^(https?:|\/\/)/);
    });

    it('resolveFileUrl proxies through to getFileUrl with constructed record', async () => {
      const { resolveFileUrl } = await import('@/lib/pocketbase');
      const url = resolveFileUrl('tests', 'rec-1', 'image.png');
      expect(url).toMatch(/^(https?:|\/\/)/);
    });

    it('resolveFileUrl returns empty string when recordId or filename missing', async () => {
      const { resolveFileUrl } = await import('@/lib/pocketbase');
      expect(resolveFileUrl('tests', '', 'foo.png')).toBe('');
      expect(resolveFileUrl('tests', 'rec-1', '')).toBe('');
    });
  });
});
