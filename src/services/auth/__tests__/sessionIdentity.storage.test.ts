import { BaseAuthStore, LocalAuthStore } from 'pocketbase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const deletionFence = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  finishSignOutIfClaim: vi.fn(),
}));
vi.mock('@/services/accountDeletion/intentStore', () => ({ deletionIntents: deletionFence }));

vi.mock('@/lib/pocketbase', async () => {
  const { LocalAuthStore } = await import('pocketbase');
  return { pb: { baseURL: 'https://data.example.test', authStore: new LocalAuthStore() } };
});

import { pb } from '@/lib/pocketbase';
import { sendFeedbackRequest } from '@/services/pocketbase/feedback.service';
import {
  captureSessionIdentity,
  createSessionIdentityTracker,
  isCurrentSessionIdentity,
} from '../sessionIdentity';
import {
  recordCompletedSessionCreate,
  subscribeToInvalidSession,
  takeCompletedSessionDestinations,
} from '../sessionRecovery';

const authKey = 'pocketbase_auth';
const epochKey = 'og:session-identity:v1:pocketbase_auth';
const account = { id: 'account-a', collectionName: 'users' };
const session = (token: string) => JSON.stringify({ token, record: account });

function deliverStorageEvent(oldValue: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: authKey,
      oldValue,
      newValue,
      storageArea: window.localStorage,
    })
  );
}

describe('session identity across queued storage events', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    deletionFence.get.mockReset().mockResolvedValue(undefined);
    deletionFence.list.mockReset().mockResolvedValue([]);
    deletionFence.finishSignOutIfClaim.mockReset();
    pb.authStore.clear();
    pb.authStore.save('token-a', account);
  });

  it('retires old work when queued logout and same-account login both read the latest session', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();
    otherTabStore.clear();
    otherTabStore.save('new-login-token-a', account);
    deliverStorageEvent(session('token-a'), null);
    expect(pb.authStore.token).toBe('new-login-token-a');
    expect(pb.authStore.record?.id).toBe('account-a');
    deliverStorageEvent(null, session('new-login-token-a'));
    expect(isCurrentSessionIdentity(identity)).toBe(false);
    recordCompletedSessionCreate('token-a', 'projects', 'late-cross-tab-create');
    expect(takeCompletedSessionDestinations('account-b', '/projects/')).toEqual([]);
    expect(takeCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/late-cross-tab-create',
    ]);
  });

  it('does not let an old feedback 401 clear a same-token replacement session', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            resolveResponse = resolve;
          })
      )
    );
    const onInvalidSession = vi.fn();
    const unsubscribe = subscribeToInvalidSession(onInvalidSession);
    const request = sendFeedbackRequest({ feedback: 'A useful feedback message' }, 'token-a');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);

    otherTabStore.clear();
    otherTabStore.save('token-a', account);
    resolveResponse(new Response(null, { status: 401 }));

    await expect(request).resolves.toMatchObject({
      response: { status: 401 },
      sessionBlocked: false,
    });
    unsubscribe();
    expect(pb.authStore.token).toBe('token-a');
    expect(pb.authStore.record?.id).toBe('account-a');
    expect(onInvalidSession).not.toHaveBeenCalled();
  });
  it('blocks dispatch and fences an accepted response after a cross-tab deletion intent', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    deletionFence.get.mockResolvedValue({ phase: 'pending' });
    await expect(sendFeedbackRequest({ feedback: 'draft' }, 'token-a')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    deletionFence.get.mockResolvedValueOnce(undefined).mockResolvedValue({ phase: 'pending' });
    await expect(sendFeedbackRequest({ feedback: 'draft' }, 'token-a')).resolves.toMatchObject({
      response: { status: 200 },
      sessionBlocked: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('preserves a failed clear epoch for retry and restart only while the auth session survives', () => {
    const identity = captureSessionIdentity();
    const originalEpoch = JSON.parse(localStorage.getItem(epochKey)!).epoch as string;
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const originalRemoveItem = storagePrototype.removeItem;
    let failed = false;
    const removeItem = vi.spyOn(storagePrototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key
    ) {
      if (key === authKey && !failed) {
        failed = true;
        throw new Error('Auth storage unavailable');
      }
      originalRemoveItem.call(this, key);
    });

    expect(() => pb.authStore.clear()).toThrow('Auth storage unavailable');
    expect(pb.authStore.token).toBe('token-a');
    expect(JSON.parse(localStorage.getItem(epochKey)!).epoch).toBe(originalEpoch);
    expect(isCurrentSessionIdentity(identity)).toBe(true);

    const restartedStore = new LocalAuthStore();
    const restartedTracker = createSessionIdentityTracker(restartedStore, localStorage);
    expect(restartedTracker.capture().epoch).toBe(originalEpoch);
    expect(restartedTracker.isCurrent(restartedTracker.capture())).toBe(true);

    removeItem.mockRestore();
    pb.authStore.clear();
    expect(isCurrentSessionIdentity(identity)).toBe(false);
    expect(restartedTracker.capture().accountId).toBeNull();
  });

  it('does not restore a failed clear over a concurrent session marker', () => {
    const identity = captureSessionIdentity();
    const newer = { accountId: 'account-a', epoch: 'newer-tab-epoch' };
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const removeItem = vi.spyOn(storagePrototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key
    ) {
      if (key === authKey) {
        this.setItem(epochKey, JSON.stringify(newer));
        throw new Error('Auth storage unavailable');
      }
    });

    try {
      expect(() => pb.authStore.clear()).toThrow('Auth storage unavailable');
      expect(pb.authStore.token).toBe('token-a');
      expect(JSON.parse(localStorage.getItem(epochKey)!)).toEqual(newer);
      expect(isCurrentSessionIdentity(identity)).toBe(false);
    } finally {
      removeItem.mockRestore();
    }
  });

  it('preserves work for a same-account token refresh from another tab', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();

    otherTabStore.save('refreshed-token-a', account);

    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });

  it('fails closed when the shared marker becomes corrupt', () => {
    const identity = captureSessionIdentity();
    localStorage.setItem(epochKey, '{corrupt');

    expect(isCurrentSessionIdentity(identity)).toBe(false);

    const repairedIdentity = captureSessionIdentity();
    expect(isCurrentSessionIdentity(repairedIdentity)).toBe(true);
  });

  it('fails closed when browser storage cannot persist the marker', () => {
    const store = new BaseAuthStore();
    store.save('isolated-token', account);
    const unavailableStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('Storage unavailable', 'QuotaExceededError');
      }),
    } as unknown as Storage;
    const tracker = createSessionIdentityTracker(store, unavailableStorage);

    const identity = tracker.capture();

    expect(tracker.isCurrent(identity)).toBe(false);
  });
});
