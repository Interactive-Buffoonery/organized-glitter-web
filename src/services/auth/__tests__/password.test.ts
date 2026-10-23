import { changePassword } from '@/services/auth';
import { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPasswordResetMock, confirmPasswordResetMock, updateMock, authStore } = vi.hoisted(
  () => ({
    requestPasswordResetMock: vi.fn(),
    confirmPasswordResetMock: vi.fn(),
    updateMock: vi.fn(),
    authStore: {
      isValid: true,
      token: 'mock-token',
      record: { id: 'user-1' } as { id: string } | null,
      onChange: vi.fn(() => () => undefined),
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

  it('returns not authenticated before password change without a current user', async () => {
    authStore.record = null;

    const result = await changePassword('old-password', 'new-password', 'new-password');

    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(updateMock).not.toHaveBeenCalled();
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
});
