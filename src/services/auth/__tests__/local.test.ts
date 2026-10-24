import { loginWithPassword } from '@/services/auth';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import { AccountDeletionError } from '@/services/accountDeletion/types';
import { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authStore, authWithPasswordMock, createMock, requestVerificationMock, resetAuthStore } =
  vi.hoisted(() => {
    type AuthRecord = { id: string; email?: string; verified?: boolean };
    const listeners: Array<(token: string, record: AuthRecord | null) => void> = [];
    let token = '';
    let record: AuthRecord | null = null;

    const updateAuthStore = (nextToken: string, nextRecord: AuthRecord | null) => {
      token = nextToken;
      record = nextRecord;
      listeners.forEach(listener => listener(token, record));
    };

    return {
      authStore: {
        get token() {
          return token;
        },
        get record() {
          return record;
        },
        get isValid() {
          return Boolean(token && record);
        },
        onChange: vi.fn((listener: (token: string, record: AuthRecord | null) => void) => {
          listeners.push(listener);
        }),
        save: vi.fn(updateAuthStore),
        clear: vi.fn(() => updateAuthStore('', null)),
      },
      authWithPasswordMock: vi.fn(),
      createMock: vi.fn(),
      requestVerificationMock: vi.fn(),
      resetAuthStore: () => updateAuthStore('', null),
    };
  });

vi.mock('pocketbase', async importOriginal => {
  const actual = await importOriginal<typeof import('pocketbase')>();
  return {
    ...actual,
    default: class {
      authStore = { clear: vi.fn() };
      collection() {
        return { authWithPassword: authWithPasswordMock };
      }
    },
  };
});

vi.mock('@/services/accountDeletion/intentStore', () => ({
  deletionIntents: {
    applyAuthIfClear: vi.fn(async (_backend, _account, apply: () => boolean) => apply()),
  },
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    baseURL: 'http://127.0.0.1:8090',
    authStore,
    collection: vi.fn(() => ({
      authWithPassword: authWithPasswordMock,
      create: createMock,
      requestVerification: requestVerificationMock,
    })),
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('local auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStore();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
      })
    );
  });

  // These admission failures must remain actionable without installing the new session.
  it.each(['pending', 'storage'] as const)(
    'preserves the %s deletion admission error during password login',
    async reason => {
      authWithPasswordMock.mockResolvedValue({
        token: 'new-session-token',
        record: { id: 'user-1', verified: true },
      });
      const error = new AccountDeletionError(reason);
      vi.mocked(deletionIntents.applyAuthIfClear).mockRejectedValueOnce(error);

      await expect(
        loginWithPassword({ email: 'sarah@example.test', password: 'password-123' })
      ).resolves.toEqual({ success: false, error: error.message });
      expect(authStore.save).not.toHaveBeenCalled();
      expect(authStore.clear).not.toHaveBeenCalled();
      expect(authStore.token).toBe('');
    }
  );

  it('clears auth and rejects login for an unverified user', async () => {
    authWithPasswordMock.mockImplementation(() => {
      const authData = {
        token: 'unverified-session-token',
        record: {
          id: 'user-1',
          email: 'sarah@example.test',
          verified: false,
        },
      };
      return Promise.resolve(authData);
    });

    const result = await loginWithPassword({
      email: 'sarah@example.test',
      password: 'password-123',
    });

    expect(result).toEqual({
      success: false,
      error:
        'Your email address must be verified before you can sign in. Check your inbox and spam folder, or request a new verification email.',
      recovery: {
        type: 'email-verification',
        email: 'sarah@example.test',
      },
    });
    expect(authStore.clear).not.toHaveBeenCalled();
  });

  it('does not dispatch a password login after the initiating session changes', async () => {
    let resolveHealthCheck!: (response: { ok: boolean }) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise(resolve => {
        resolveHealthCheck = resolve;
      }) as Promise<Response>
    );

    const login = loginWithPassword({
      email: 'sarah@example.test',
      password: 'password-123',
    });
    authStore.save('new-session-token', {
      id: 'user-2',
      email: 'newer@example.test',
      verified: true,
    });
    resolveHealthCheck({ ok: true });

    await expect(login).resolves.toMatchObject({ success: false });
    expect(authWithPasswordMock).not.toHaveBeenCalled();
    expect(authStore.token).toBe('new-session-token');
    expect(authStore.record?.id).toBe('user-2');
  });

  it('does not clear a newer session when an earlier password login is rejected', async () => {
    let rejectLogin!: (error: unknown) => void;
    authWithPasswordMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectLogin = reject;
      })
    );

    const login = loginWithPassword({
      email: 'sarah@example.test',
      password: 'password-123',
    });
    await vi.waitFor(() => expect(authWithPasswordMock).toHaveBeenCalledOnce());

    authStore.save('new-session-token', {
      id: 'user-2',
      email: 'newer@example.test',
      verified: true,
    });
    rejectLogin(
      new ClientResponseError({
        url: 'http://127.0.0.1:8090/api/collections/users/auth-with-password',
        status: 403,
        response: {
          message: "The request doesn't satisfy the collection requirements to authenticate.",
        },
      })
    );

    await expect(login).resolves.toMatchObject({
      success: false,
      recovery: { type: 'email-verification' },
    });
    expect(authStore.clear).not.toHaveBeenCalled();
    expect(authStore.token).toBe('new-session-token');
    expect(authStore.record?.id).toBe('user-2');
  });
});
