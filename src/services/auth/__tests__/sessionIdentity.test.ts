import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => {
  const listeners: Array<(token: string, record: { id: string } | null) => void> = [];
  return {
    store: {
      token: 'token-a',
      record: { id: 'account-a' } as { id: string } | null,
      onChange: (listener: (token: string, record: { id: string } | null) => void) => {
        listeners.push(listener);
      },
      save(token: string, record: { id: string } | null) {
        this.token = token;
        this.record = record;
        listeners.forEach(listener => listener(token, this.record));
      },
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({ pb: { authStore: store } }));

import { captureSessionIdentity, isCurrentSessionIdentity } from '../sessionIdentity';

describe('session identity', () => {
  beforeEach(() => store.save('token-a', { id: 'account-a' }));

  it('preserves the identity when the same account refreshes its token', () => {
    const identity = captureSessionIdentity();
    store.save('refreshed-token-a', { id: 'account-a' });
    expect(isCurrentSessionIdentity(identity)).toBe(true);
  });

  it('retires the identity synchronously on an account switch', () => {
    const identity = captureSessionIdentity();
    store.save('token-b', { id: 'account-b' });
    expect(isCurrentSessionIdentity(identity)).toBe(false);
  });

  it('does not revive the identity after signing back into the same account', () => {
    const identity = captureSessionIdentity();
    store.save('', null);
    store.save('token-a', { id: 'account-a' });
    expect(isCurrentSessionIdentity(identity)).toBe(false);
  });
});
