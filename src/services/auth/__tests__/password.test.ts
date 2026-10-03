import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { changePassword, confirmPasswordReset, requestPasswordReset } from '@/services/auth';

const { requestPasswordResetMock, confirmPasswordResetMock, updateMock, authStore } = vi.hoisted(
  () => ({
    requestPasswordResetMock: vi.fn(),
    confirmPasswordResetMock: vi.fn(),
    updateMock: vi.fn(),
    authStore: {
      isValid: true,
      token: 'mock-token',
      record: { id: 'user-1' } as { id: string } | null,
    },
  })
);

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore,
    collection: vi.fn(() => ({
      requestPasswordReset: requestPasswordResetMock,
      confirmPasswordReset: confirmPasswordResetMock,
      update: updateMock,
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

describe('password auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.isValid = true;
    authStore.record = { id: 'user-1' };
  });

  it('normalizes email before requesting a password reset', async () => {
    requestPasswordResetMock.mockResolvedValue(undefined);

    const result = await requestPasswordReset('  Sarah@Example.Test  ');

    expect(result).toEqual({ success: true });
    expect(requestPasswordResetMock).toHaveBeenCalledWith('sarah@example.test');
  });

  it('confirms a password reset with token and password confirmation', async () => {
    confirmPasswordResetMock.mockResolvedValue(undefined);

    const result = await confirmPasswordReset('token-123', 'new-password', 'new-password');

    expect(result).toEqual({ success: true });
    expect(confirmPasswordResetMock).toHaveBeenCalledWith(
      'token-123',
      'new-password',
      'new-password'
    );
  });

  it('returns not authenticated before password change without a current user', async () => {
    authStore.record = null;

    const result = await changePassword('old-password', 'new-password', 'new-password');

    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates the current user password with the old password', async () => {
    updateMock.mockResolvedValue({ id: 'user-1' });

    const result = await changePassword('old-password', 'new-password', 'new-password');

    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith('user-1', {
      oldPassword: 'old-password',
      password: 'new-password',
      passwordConfirm: 'new-password',
    });
  });

  it('preserves an SDK validation reason without exposing private response content', async () => {
    updateMock.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        data: {
          data: {
            reason: {
              code: 'session_required',
              message: 'Internal verification detail',
            },
          },
        },
      })
    );

    const result = await changePassword('old-password', 'new-password', 'new-password');

    expect(result).toMatchObject({
      success: false,
      reason: 'session_required',
      error: 'Your session expired. Please sign in again.',
    });
    expect(result.error).not.toContain('Internal verification detail');
  });

  it('keeps legitimate password field validation copy', async () => {
    updateMock.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        data: {
          data: {
            password: {
              code: 'validation_invalid_value',
              message: 'Password is too short.',
            },
          },
        },
      })
    );

    const result = await changePassword('old-password', 'short', 'short');

    expect(result).toEqual({
      success: false,
      error: 'Password: Password is too short.',
    });
  });
});
