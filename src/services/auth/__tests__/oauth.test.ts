import { loginWithOAuth2 } from '@/services/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authWithOAuth2Mock, updateMock, authStoreSaveMock, applyAuthMock, clearMock } = vi.hoisted(
  () => ({
    authWithOAuth2Mock: vi.fn(),
    updateMock: vi.fn(),
    authStoreSaveMock: vi.fn(),
    applyAuthMock: vi.fn(),
    clearMock: vi.fn(),
  })
);

vi.mock('pocketbase', async importOriginal => {
  const actual = await importOriginal<typeof import('pocketbase')>();
  return {
    ...actual,
    default: class {
      authStore = { clear: clearMock };
      collection() {
        return { authWithOAuth2: authWithOAuth2Mock, update: updateMock };
      }
    },
  };
});

vi.mock('@/services/accountDeletion/intentStore', () => ({
  deletionIntents: { applyAuthIfClear: applyAuthMock },
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'token-1',
      record: { id: 'user-1' },
      save: authStoreSaveMock,
      onChange: vi.fn(() => () => undefined),
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
    applyAuthMock.mockImplementation(async (_backend, _account, apply) => apply());
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

  it('does not apply an isolated OAuth login while deletion recovery is pending', async () => {
    authWithOAuth2Mock.mockResolvedValue({
      token: 'new-token',
      record: { id: 'user-1', beta_tester: true },
    });
    applyAuthMock.mockRejectedValueOnce(new Error('Pending deletion'));
    await expect(loginWithOAuth2('google')).resolves.toMatchObject({ success: false });
    expect(authStoreSaveMock).not.toHaveBeenCalled();
    expect(clearMock).toHaveBeenCalledOnce();
  });
});
