import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { loginWithPassword, registerWithPassword } from '@/services/auth';

const { authWithPasswordMock, createMock, requestVerificationMock, clearMock } = vi.hoisted(() => ({
  authWithPasswordMock: vi.fn(),
  createMock: vi.fn(),
  requestVerificationMock: vi.fn(),
  clearMock: vi.fn(),
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    baseURL: 'http://127.0.0.1:8090',
    authStore: {
      isValid: false,
      record: null,
      clear: clearMock,
    },
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
    authWithPasswordMock.mockResolvedValue({
      record: {
        id: 'user-1',
        email: 'sarah@example.test',
        verified: false,
      },
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
    expect(clearMock).toHaveBeenCalledOnce();
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
    expect(clearMock).not.toHaveBeenCalled();
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
    expect(clearMock).toHaveBeenCalledOnce();
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
      error: 'Connection failed. Please check your internet connection and try again.',
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
