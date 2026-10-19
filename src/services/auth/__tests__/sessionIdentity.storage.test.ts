import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAuthStore, LocalAuthStore } from 'pocketbase';
const deletionFence = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/accountDeletion/intentStore', () => ({ deletionIntents: deletionFence }));

vi.mock('@/lib/pocketbase', async () => {
  const { LocalAuthStore } = await import('pocketbase');
  return { pb: { baseURL: 'https://data.example.test', authStore: new LocalAuthStore() } };
});

import { pb } from '@/lib/pocketbase';
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
import { sendFeedbackRequest } from '@/services/pocketbase/feedback.service';

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

  it('retires old work before cross-tab storage events are delivered', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();

    otherTabStore.clear();
    otherTabStore.save('new-login-token-a', account);

    expect(pb.authStore.token).toBe('new-login-token-a');
    expect(isCurrentSessionIdentity(identity)).toBe(false);
    expect(isCurrentSessionIdentity(captureSessionIdentity())).toBe(true);
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

    await expect(request).resolves.toHaveProperty('status', 401);
    unsubscribe();
    expect(pb.authStore.token).toBe('token-a');
    expect(pb.authStore.record?.id).toBe('account-a');
    expect(onInvalidSession).not.toHaveBeenCalled();
  });

  it('still reports a feedback 401 from the current session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const onInvalidSession = vi.fn();
    const unsubscribe = subscribeToInvalidSession(onInvalidSession);

    await expect(
      sendFeedbackRequest({ feedback: 'A useful feedback message' }, 'token-a')
    ).resolves.toHaveProperty('status', 401);
    unsubscribe();

    expect(onInvalidSession).toHaveBeenCalledOnce();
    expect(onInvalidSession).toHaveBeenCalledWith('token-a');
  });
  it('blocks raw feedback before and after a cross-tab deletion intent', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    deletionFence.get.mockResolvedValue({ phase: 'pending' });
    await expect(sendFeedbackRequest({ feedback: 'draft' }, 'token-a')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    deletionFence.get.mockResolvedValueOnce(undefined).mockResolvedValue({ phase: 'pending' });
    await expect(sendFeedbackRequest({ feedback: 'draft' }, 'token-a')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('sees a cross-account change before its storage event is delivered', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();

    otherTabStore.save('token-b', { id: 'account-b', collectionName: 'users' });

    expect(pb.authStore.record?.id).toBe('account-b');
    expect(isCurrentSessionIdentity(identity)).toBe(false);
    expect(captureSessionIdentity().accountId).toBe('account-b');
  });

  it('retires cross-account work before the SDK writes shared auth storage', () => {
    const identity = captureSessionIdentity();
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const originalSetItem = storagePrototype.setItem;
    let currentDuringAuthWrite: boolean | undefined;
    const setItem = vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === authKey) currentDuringAuthWrite = isCurrentSessionIdentity(identity);
      originalSetItem.call(this, key, value);
    });

    try {
      pb.authStore.save('token-b', { id: 'account-b', collectionName: 'users' });
    } finally {
      setItem.mockRestore();
    }

    expect(currentDuringAuthWrite).toBe(false);
  });

  it('retires both sides of same-account logout before each shared auth write', () => {
    const signedInIdentity = captureSessionIdentity();
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const originalRemoveItem = storagePrototype.removeItem;
    let signedInCurrentDuringClear: boolean | undefined;
    const removeItem = vi.spyOn(storagePrototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key
    ) {
      if (key === authKey) {
        signedInCurrentDuringClear = isCurrentSessionIdentity(signedInIdentity);
      }
      originalRemoveItem.call(this, key);
    });

    try {
      pb.authStore.clear();
    } finally {
      removeItem.mockRestore();
    }

    const signedOutIdentity = captureSessionIdentity();
    const originalSetItem = storagePrototype.setItem;
    let signedOutCurrentDuringLogin: boolean | undefined;
    const setItem = vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === authKey) {
        signedOutCurrentDuringLogin = isCurrentSessionIdentity(signedOutIdentity);
      }
      originalSetItem.call(this, key, value);
    });

    try {
      pb.authStore.save('token-a', account);
    } finally {
      setItem.mockRestore();
    }

    expect(signedInCurrentDuringClear).toBe(false);
    expect(signedOutCurrentDuringLogin).toBe(false);
  });

  it('preserves work for a same-account token refresh from another tab', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();

    otherTabStore.save('refreshed-token-a', account);

    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });

  it('keeps new-session work current when obsolete auth events arrive', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const oldSession = session('token-a');

    otherTabStore.clear();
    otherTabStore.save('new-login-token-a', account);
    const identity = captureSessionIdentity();

    deliverStorageEvent(oldSession, null);
    deliverStorageEvent(null, session('new-login-token-a'));

    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });

  it('attributes a late create before cross-tab storage events are delivered', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    captureSessionIdentity();

    otherTabStore.clear();
    otherTabStore.save('new-login-token-a', account);
    recordCompletedSessionCreate('token-a', 'projects', 'late-before-storage-event');

    expect(takeCompletedSessionDestinations('account-b', '/projects/')).toEqual([]);
    expect(takeCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/late-before-storage-event',
    ]);
  });

  it('retains the original create token through a queued refresh before logout', () => {
    pb.authStore.save('original-before-refresh', account);
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();
    otherTabStore.save('refreshed-token-a', account);
    otherTabStore.clear();
    otherTabStore.save('new-login-token-a', account);
    deliverStorageEvent(session('original-before-refresh'), session('refreshed-token-a'));
    deliverStorageEvent(session('refreshed-token-a'), null);
    deliverStorageEvent(null, session('new-login-token-a'));
    expect(isCurrentSessionIdentity(identity)).toBe(false);
    recordCompletedSessionCreate('original-before-refresh', 'projects', 'late-refreshed-create');
    expect(takeCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/late-refreshed-create',
    ]);
  });

  it('ignores changes to unrelated browser storage', () => {
    const identity = captureSessionIdentity();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'theme', oldValue: 'dark', newValue: null })
    );
    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });

  it('fails closed when the shared marker becomes corrupt', () => {
    const identity = captureSessionIdentity();
    localStorage.setItem(epochKey, '{corrupt');

    expect(isCurrentSessionIdentity(identity)).toBe(false);

    const repairedIdentity = captureSessionIdentity();
    expect(isCurrentSessionIdentity(repairedIdentity)).toBe(true);
  });

  it('keeps a stranded transition closed until the next auth mutation completes', () => {
    const identity = captureSessionIdentity();
    localStorage.setItem(
      epochKey,
      JSON.stringify({ accountId: 'account-a', epoch: 'stranded', transition: true })
    );

    expect(isCurrentSessionIdentity(identity)).toBe(false);

    pb.authStore.save('refreshed-token-a', account);
    const recoveredIdentity = captureSessionIdentity();
    expect(isCurrentSessionIdentity(recoveredIdentity)).toBe(true);
    expect(isCurrentSessionIdentity(identity)).toBe(false);
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

  it('does not revive the old epoch when a transition marker write exceeds quota', () => {
    const values = new Map<string, string>();
    let rejectWrites = false;
    const quotaStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (rejectWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => values.delete(key)),
    } as unknown as Storage;
    const originStore = new BaseAuthStore();
    const observingStore = new BaseAuthStore();
    originStore.save('token-a', account);
    observingStore.save('token-a', account);
    const origin = createSessionIdentityTracker(originStore, quotaStorage);
    const observer = createSessionIdentityTracker(observingStore, quotaStorage);
    const oldOriginIdentity = origin.capture();
    const oldObserverIdentity = observer.capture();

    rejectWrites = true;
    originStore.clear();
    originStore.save('token-a', account);

    expect(origin.isCurrent(oldOriginIdentity)).toBe(false);
    expect(observer.isCurrent(oldObserverIdentity)).toBe(false);
    expect(values.get(epochKey)).toBeUndefined();
    expect(origin.isCurrent(origin.capture())).toBe(false);

    rejectWrites = false;
    const repairedIdentity = origin.capture();
    expect(origin.isCurrent(repairedIdentity)).toBe(true);
    expect(observer.isCurrent(oldObserverIdentity)).toBe(false);
  });

  it('uses the in-memory identity when browser storage does not exist', () => {
    const store = new BaseAuthStore();
    store.save('isolated-token', account);
    const tracker = createSessionIdentityTracker(store, null);
    const identity = tracker.capture();

    expect(tracker.isCurrent(identity)).toBe(true);
    store.clear();
    expect(tracker.isCurrent(identity)).toBe(false);
  });

  it('preserves mock controls when auth mutation functions are wrapped', () => {
    const store = {
      token: 'token-a',
      record: account,
      onChange: vi.fn(),
      save: vi.fn(),
      clear: vi.fn(),
    };
    createSessionIdentityTracker(store, null);

    store.save('token-a', account);
    expect(store.save).toHaveBeenCalledOnce();
    store.save.mockClear();
    expect(store.save).not.toHaveBeenCalled();

    store.clear();
    expect(store.clear).toHaveBeenCalledOnce();
    store.clear.mockReset();
    expect(store.clear).not.toHaveBeenCalled();
  });
});
