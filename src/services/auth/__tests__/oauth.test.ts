import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginWithOAuth2 } from '@/services/auth';

const { authWithOAuth2Mock, updateMock, authStoreSaveMock } = vi.hoisted(() => ({
  authWithOAuth2Mock: vi.fn(),
  updateMock: vi.fn(),
  authStoreSaveMock: vi.fn(),
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'token-1',
      record: { id: 'user-1' },
      save: authStoreSaveMock,
    },
    collection: vi.fn(() => ({
      authWithOAuth2: authWithOAuth2Mock,
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

describe('OAuth auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts provider OAuth synchronously so Safari keeps the click gesture', async () => {
    const authData = {
      meta: { isNewRecord: false },
      record: {
        id: 'user-1',
        email: 'sarah@example.test',
        beta_tester: true,
      },
    };
    let resolveAuth!: (value: typeof authData) => void;
    authWithOAuth2Mock.mockReturnValue(
      new Promise(resolve => {
        resolveAuth = resolve;
      })
    );

    const loginPromise = loginWithOAuth2('discord');

    expect(authWithOAuth2Mock).toHaveBeenCalledWith({ provider: 'discord' });

    resolveAuth(authData);
    await expect(loginPromise).resolves.toEqual({
      success: true,
      user: authData.record,
    });
  });

  it('updates missing beta tester flag after OAuth login', async () => {
    authWithOAuth2Mock.mockResolvedValue({
      meta: { isNewRecord: true },
      record: {
        id: 'user-1',
        email: 'sarah@example.test',
        beta_tester: false,
      },
    });
    updateMock.mockResolvedValue({
      id: 'user-1',
      email: 'sarah@example.test',
      beta_tester: true,
    });

    const result = await loginWithOAuth2('google');

    expect(result).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'sarah@example.test',
        beta_tester: true,
      },
    });
    expect(authWithOAuth2Mock).toHaveBeenCalledWith({ provider: 'google' });
    expect(updateMock).toHaveBeenCalledWith('user-1', { beta_tester: true });
  });

  it('keeps OAuth success when beta tester update fails', async () => {
    authWithOAuth2Mock.mockResolvedValue({
      meta: { isNewRecord: false },
      record: {
        id: 'user-1',
        email: 'sarah@example.test',
        beta_tester: false,
      },
    });
    updateMock.mockRejectedValue(new Error('update failed'));

    const result = await loginWithOAuth2('discord');

    expect(result).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'sarah@example.test',
        beta_tester: false,
      },
    });
  });

  it('returns popup guidance when OAuth popup is blocked', async () => {
    authWithOAuth2Mock.mockRejectedValue(new Error('Popup blocked'));

    const result = await loginWithOAuth2('google');

    expect(result).toEqual({
      success: false,
      error: 'Please allow popups for this site to sign in with Google.',
    });
  });

  it('returns cancellation guidance when OAuth popup is closed', async () => {
    authWithOAuth2Mock.mockRejectedValue(new Error('Window closed by user'));

    const result = await loginWithOAuth2('discord');

    expect(result).toEqual({
      success: false,
      error: 'Discord sign-in was cancelled. Please try again when ready.',
    });
  });
});
