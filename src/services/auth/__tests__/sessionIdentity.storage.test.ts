import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbase', async () => {
  const { LocalAuthStore } = await import('pocketbase');
  return { pb: { authStore: new LocalAuthStore() } };
});

import { pb } from '@/lib/pocketbase';
import { captureSessionIdentity, isCurrentSessionIdentity } from '../sessionIdentity';
import { recordCompletedSessionCreate, takeCompletedSessionDestinations } from '../sessionRecovery';

const authKey = 'pocketbase_auth';
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
    const identity = captureSessionIdentity();
    localStorage.setItem(authKey, session('new-login-token-a'));
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

  it('preserves work for a same-account token refresh from another tab', () => {
    const identity = captureSessionIdentity();
    localStorage.setItem(authKey, session('refreshed-token-a'));
    deliverStorageEvent(session('token-a'), session('refreshed-token-a'));
    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });

  it('ignores changes to unrelated browser storage', () => {
    const identity = captureSessionIdentity();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'theme', oldValue: 'dark', newValue: null })
    );
    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });
});
