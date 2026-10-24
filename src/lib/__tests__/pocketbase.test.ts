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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import PocketBase, { LocalAuthStore, type SendOptions } from 'pocketbase';

const { mockCapture } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
}));
vi.mock('@/services/accountDeletion/intentStore', () => ({
  deletionIntents: { get: vi.fn().mockResolvedValue(undefined) },
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

    it('stops a rate-limited request when its session retires before dispatch', async () => {
      const { createSessionIdentityTracker } = await import('@/services/auth/sessionEpoch');
      const { isSessionChangedError } = await import('@/services/auth/sessionRecovery');
      const account = { id: 'account-a', collectionName: 'users' };
      pb.authStore.save('reused-token', account);
      Object.defineProperty(pb.authStore, 'isValid', { configurable: true, get: () => true });
      const otherTabStore = new LocalAuthStore();
      createSessionIdentityTracker(otherTabStore, localStorage);
      const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);

      pb.afterSend!(new Response('{}', { status: 429 }), {});
      pb.afterSend!(new Response('{}', { status: 429 }), {});
      pb.afterSend!(new Response('{}', { status: 429 }), {});
      await pb.beforeSend!('https://example.test/api/prime', buildGetOptions());
      const request = pb.send('/api/collections/projects/records', {
        method: 'POST',
        body: { title: 'Old session' },
      });
      otherTabStore.clear();
      otherTabStore.save('reused-token', account);

      try {
        await expect(request).rejects.toSatisfy(isSessionChangedError);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        pb.afterSend!(new Response('{}', { status: 200 }), {});
        pb.authStore.clear();
        Reflect.deleteProperty(pb.authStore, 'isValid');
        vi.unstubAllGlobals();
      }
    });

    it('prevents a stale authenticated auth response from replacing the live session', async () => {
      const { createSessionIdentityTracker } = await import('@/services/auth/sessionEpoch');
      const { isSessionChangedError } = await import('@/services/auth/sessionRecovery');
      const account = { id: 'account-a', collectionName: 'users' };
      pb.authStore.save('reused-token', account);
      Object.defineProperty(pb.authStore, 'isValid', { configurable: true, get: () => true });
      const otherTabStore = new LocalAuthStore();
      createSessionIdentityTracker(otherTabStore, localStorage);
      let finishRequest: ((response: Response) => void) | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>(resolve => {
              finishRequest = resolve;
            })
        )
      );

      const request = pb.collection('users').authRefresh();
      await vi.waitFor(() => expect(finishRequest).toBeTypeOf('function'));
      otherTabStore.clear();
      otherTabStore.save('reused-token', account);
      const response = new Response(
        JSON.stringify({ token: 'stale-refreshed-token', record: account }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
      Object.defineProperty(response, 'url', {
        value: 'https://data.organizedglitter.app/api/collections/users/auth-refresh',
      });
      finishRequest?.(response);

      try {
        await expect(request).rejects.toSatisfy(isSessionChangedError);
        expect(pb.authStore.token).toBe('reused-token');
      } finally {
        pb.authStore.clear();
        Reflect.deleteProperty(pb.authStore, 'isValid');
        vi.unstubAllGlobals();
      }
    });

    it('does not invalidate a replacement session from a stale same-token 401', async () => {
      const { createSessionIdentityTracker } = await import('@/services/auth/sessionEpoch');
      const { subscribeToInvalidSession } = await import('@/services/auth/sessionRecovery');
      const account = { id: 'account-a', collectionName: 'users' };
      pb.authStore.save('reused-token', account);
      Object.defineProperty(pb.authStore, 'isValid', { configurable: true, get: () => true });
      const otherTabStore = new LocalAuthStore();
      createSessionIdentityTracker(otherTabStore, localStorage);
      const invalidSessionListener = vi.fn();
      const unsubscribe = subscribeToInvalidSession(invalidSessionListener);
      let finishRequest: ((response: Response) => void) | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>(resolve => {
              finishRequest = resolve;
            })
        )
      );

      const request = pb.send('/api/collections/projects/records', { method: 'GET' });
      await vi.waitFor(() => expect(finishRequest).toBeTypeOf('function'));
      otherTabStore.clear();
      otherTabStore.save('reused-token', account);
      finishRequest?.(new Response('{}', { status: 401 }));

      try {
        await expect(request).rejects.toMatchObject({ status: 401 });
        expect(invalidSessionListener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
        pb.authStore.clear();
        Reflect.deleteProperty(pb.authStore, 'isValid');
        vi.unstubAllGlobals();
      }
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
  });
});
