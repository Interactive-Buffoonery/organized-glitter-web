import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAuthStore, LocalAuthStore } from 'pocketbase';

vi.mock('@/lib/pocketbase', async () => {
  const { LocalAuthStore } = await import('pocketbase');
  return { pb: { authStore: new LocalAuthStore() } };
});

import { pb } from '@/lib/pocketbase';
import {
  captureSessionIdentity,
  createSessionIdentityTracker,
  isCurrentSessionIdentity,
} from '../sessionIdentity';
import { recordCompletedSessionCreate, takeCompletedSessionDestinations } from '../sessionRecovery';

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
  beforeEach(() => {
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

  it('sees a cross-account change before its storage event is delivered', () => {
    const otherTabStore = new LocalAuthStore();
    createSessionIdentityTracker(otherTabStore, localStorage);
    const identity = captureSessionIdentity();

    otherTabStore.save('token-b', { id: 'account-b', collectionName: 'users' });

    expect(pb.authStore.record?.id).toBe('account-b');
    expect(isCurrentSessionIdentity(identity)).toBe(false);
    expect(captureSessionIdentity().accountId).toBe('account-b');
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
});
