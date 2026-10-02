import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import {
  confirmEmailChange,
  confirmEmailVerification,
  requestEmailChange,
  requestVerification,
} from '@/services/auth';

const {
  confirmVerificationMock,
  requestEmailChangeMock,
  confirmEmailChangeMock,
  requestVerificationMock,
} = vi.hoisted(() => ({
  confirmVerificationMock: vi.fn(),
  requestEmailChangeMock: vi.fn(),
  confirmEmailChangeMock: vi.fn(),
  requestVerificationMock: vi.fn(),
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: vi.fn(() => ({
      confirmVerification: confirmVerificationMock,
      requestEmailChange: requestEmailChangeMock,
      confirmEmailChange: confirmEmailChangeMock,
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

describe('email auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms email verification with a token', async () => {
    confirmVerificationMock.mockResolvedValue(undefined);

    const result = await confirmEmailVerification('verify-token');

    expect(result).toEqual({ success: true });
    expect(confirmVerificationMock).toHaveBeenCalledWith('verify-token');
  });

  it('maps expired verification token errors to the specific UX message', async () => {
    confirmVerificationMock.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: {
          message: 'token expired',
        },
      })
    );

    const result = await confirmEmailVerification('expired-token');

    expect(result).toEqual({
      success: false,
      error:
        'Verification link has expired or is invalid. Please request a new verification email.',
    });
  });

  it('normalizes email before requesting an email change', async () => {
    requestEmailChangeMock.mockResolvedValue(undefined);

    const result = await requestEmailChange('  New@Example.Test  ');

    expect(result).toEqual({ success: true });
    expect(requestEmailChangeMock).toHaveBeenCalledWith('new@example.test');
  });

  it('confirms email change with token and password', async () => {
    confirmEmailChangeMock.mockResolvedValue(undefined);

    const result = await confirmEmailChange('change-token', 'password-123');

    expect(result).toEqual({ success: true });
    expect(confirmEmailChangeMock).toHaveBeenCalledWith('change-token', 'password-123');
  });

  it('normalizes email before requesting verification', async () => {
    requestVerificationMock.mockResolvedValue(undefined);

    const result = await requestVerification('  Sarah@Example.Test  ');

    expect(result).toEqual({ success: true });
    expect(requestVerificationMock).toHaveBeenCalledWith('sarah@example.test');
  });
});
