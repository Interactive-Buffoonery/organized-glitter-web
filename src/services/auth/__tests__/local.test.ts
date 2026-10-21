import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { loginWithPassword, registerWithPassword } from '@/services/auth';

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

  it('normalizes email before password login', async () => {
    authWithPasswordMock.mockResolvedValue({
      token: 'login-token',
      record: {
        id: 'user-1',
        email: 'sarah@example.test',
        verified: true,
      },
    });

    const result = await loginWithPassword({
      email: '  Sarah@Example.Test  ',
      password: 'password-123',
    });

    expect(result).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'sarah@example.test',
        verified: true,
      },
    });
    expect(authWithPasswordMock).toHaveBeenCalledWith('sarah@example.test', 'password-123');
  });

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

  it('does not treat an unrelated forbidden response as email verification', async () => {
    authWithPasswordMock.mockRejectedValue(
      new ClientResponseError({
        url: 'http://127.0.0.1:8090/api/collections/users/auth-with-password',
        status: 403,
        response: {
          message: 'You are not allowed to perform this request.',
        },
      })
    );

    const result = await loginWithPassword({
      email: 'sarah@example.test',
      password: 'password-123',
    });

    expect(result.recovery).toBeUndefined();
    expect(result.success).toBe(false);
    expect(authStore.clear).not.toHaveBeenCalled();
  });

  it.each([
    'Only verified users can authenticate.',
    "The request doesn't satisfy the collection requirements to authenticate.",
  ])('returns email verification recovery for auth-rule rejection: %s', async message => {
    authWithPasswordMock.mockRejectedValue(
      new ClientResponseError({
        url: 'http://127.0.0.1:8090/api/collections/users/auth-with-password',
        status: 403,
        response: {
          message,
        },
      })
    );

    const result = await loginWithPassword({
      email: '  Sarah@Example.Test  ',
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

  it('returns validation errors before calling PocketBase', async () => {
    await expect(loginWithPassword({ email: '', password: 'password-123' })).resolves.toEqual({
      success: false,
      error: 'Please enter your email address.',
    });

    await expect(loginWithPassword({ email: 'sarah@example.test', password: '' })).resolves.toEqual(
      {
        success: false,
        error: 'Please enter your password.',
      }
    );

    await expect(
      loginWithPassword({ email: 'not-an-email', password: 'password-123' })
    ).resolves.toEqual({
      success: false,
      error: 'Please enter a valid email address (e.g., name@example.com).',
    });

    expect(authWithPasswordMock).not.toHaveBeenCalled();
  });

  it('returns a connection message for status zero password login failures', async () => {
    authWithPasswordMock.mockRejectedValue(
      new ClientResponseError({
        url: 'http://127.0.0.1:8090/api/collections/users/auth-with-password',
        status: 0,
        response: {},
      })
    );

    const result = await loginWithPassword({
      email: 'sarah@example.test',
      password: 'password-123',
    });

    expect(result).toEqual({
      success: false,
      error: 'Network connection failed. Please check your connection and try again.',
    });
  });

  it('registers a normalized beta tester user and requests verification', async () => {
    createMock.mockResolvedValue({ id: 'user-1' });
    requestVerificationMock.mockResolvedValue(undefined);

    const result = await registerWithPassword({
      email: '  Sarah@Example.Test  ',
      password: 'password-123',
      confirmPassword: 'password-123',
      username: 'sarah',
    });

    expect(result).toEqual({ success: true, user: undefined });
    expect(createMock).toHaveBeenCalledWith({
      email: 'sarah@example.test',
      password: 'password-123',
      passwordConfirm: 'password-123',
      username: 'sarah',
      beta_tester: true,
    });
    expect(requestVerificationMock).toHaveBeenCalledWith('sarah@example.test');
  });
});
