import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authWithOAuth2Mock,
  listAuthMethodsMock,
  listExternalAuthsMock,
  sendMock,
  sessionState,
  saveMock,
  verificationAuthWithOAuth2Mock,
  verificationClearMock,
} = vi.hoisted(() => ({
  authWithOAuth2Mock: vi.fn(),
  listAuthMethodsMock: vi.fn(),
  listExternalAuthsMock: vi.fn(),
  sendMock: vi.fn(),
  sessionState: {
    current: { accountId: 'user-1' as string | null, generation: 0, epoch: 'epoch-a' },
  },
  saveMock: vi.fn(),
  verificationAuthWithOAuth2Mock: vi.fn(),
  verificationClearMock: vi.fn(),
}));

vi.mock('pocketbase', async importOriginal => {
  const actual = await importOriginal<typeof import('pocketbase')>();
  return {
    ...actual,
    default: class {
      authStore = { clear: verificationClearMock };

      collection() {
        return { authWithOAuth2: verificationAuthWithOAuth2Mock };
      }
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'original-token',
      record: { id: 'user-1', email: 'sarah@example.test' },
      save: saveMock,
    },
    baseURL: 'http://127.0.0.1:8090',
    collection: vi.fn(() => ({
      authWithOAuth2: authWithOAuth2Mock,
      listAuthMethods: listAuthMethodsMock,
      listExternalAuths: listExternalAuthsMock,
    })),
    send: sendMock,
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ ...sessionState.current }),
  isCurrentSessionIdentity: (identity: typeof sessionState.current) =>
    identity.accountId === sessionState.current.accountId &&
    identity.generation === sessionState.current.generation &&
    identity.epoch === sessionState.current.epoch,
}));

import {
  connectOAuthProvider,
  listAccountSignInMethods,
  listConfiguredOAuthProviders,
  requestOAuthSignInMethodProof,
  unlinkOAuthProvider,
} from '../providers';

describe('OAuth provider service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.current = { accountId: 'user-1', generation: 0, epoch: 'epoch-a' };
  });

  it('normalizes modern providers in product order and ignores unknown entries', async () => {
    listAuthMethodsMock.mockResolvedValue({
      oauth2: {
        providers: [
          { name: 'discord' },
          { name: 'github' },
          { name: 'APPLE' },
          { name: 'discord' },
          { name: 'google' },
        ],
      },
      authProviders: [{ name: 'github' }],
    });

    await expect(listConfiguredOAuthProviders()).resolves.toEqual(['apple', 'google', 'discord']);
  });

  it('falls back to the legacy authProviders response shape', async () => {
    listAuthMethodsMock.mockResolvedValueOnce({ authProviders: [{ name: 'google' }] });
    await expect(listConfiguredOAuthProviders()).resolves.toEqual(['google']);

    listAuthMethodsMock.mockResolvedValueOnce({
      oauth2: { providers: [] },
      authProviders: [{ name: 'apple' }],
    });
    await expect(listConfiguredOAuthProviders()).resolves.toEqual([]);
  });

  it('combines configured and linked providers without dropping a disabled linked identity', async () => {
    listAuthMethodsMock.mockResolvedValue({
      oauth2: { providers: [{ name: 'apple' }, { name: 'google' }] },
    });
    listExternalAuthsMock.mockResolvedValue([
      { provider: 'google' },
      { provider: 'discord' },
      { provider: 'github' },
    ]);

    await expect(listAccountSignInMethods('user-1')).resolves.toEqual([
      { provider: 'apple', label: 'Apple', configured: true, linked: false },
      { provider: 'google', label: 'Google', configured: true, linked: true },
      { provider: 'discord', label: 'Discord', configured: false, linked: true },
    ]);
  });

  it('aborts a linked-method lookup that never responds', async () => {
    vi.useFakeTimers();
    try {
      listAuthMethodsMock.mockReturnValue(new Promise(() => {}));
      listExternalAuthsMock.mockReturnValue(new Promise(() => {}));
      const pending = listAccountSignInMethods('user-1');
      const result = expect(pending).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(15_000);
      await result;
      expect(listAuthMethodsMock.mock.calls[0][0].signal.aborted).toBe(true);
      expect(listExternalAuthsMock.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores the authenticated account if a missing backend guard returns another user', async () => {
    authWithOAuth2Mock.mockResolvedValue({ record: { id: 'user-2' }, token: 'wrong-token' });

    const result = await connectOAuthProvider('apple', 'user-1', {
      action: 'link',
      authToken: 'original-token',
      targetProvider: 'apple',
      userId: 'user-1',
      value: 'proof',
    });

    expect(result).toMatchObject({ success: false, conflict: true });
    expect(saveMock).toHaveBeenCalledWith('original-token', {
      id: 'user-1',
      email: 'sarah@example.test',
    });
  });

  it('uses the guarded backend route to unlink a provider', async () => {
    sendMock.mockResolvedValue(undefined);

    await expect(
      unlinkOAuthProvider('google', {
        action: 'unlink',
        authToken: 'original-token',
        targetProvider: 'google',
        userId: 'user-1',
        value: 'fresh-proof',
      })
    ).resolves.toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledWith('/api/auth/external-auths/google', {
      method: 'DELETE',
      body: { proof: 'fresh-proof' },
    });
  });

  it('does not use a proof after the authenticated account changes', async () => {
    const result = await connectOAuthProvider('google', 'user-1', {
      action: 'link',
      authToken: 'different-token',
      targetProvider: 'google',
      userId: 'user-1',
      value: 'fresh-proof',
    });

    expect(result).toMatchObject({ success: false, reason: 'account_changed' });
    expect(authWithOAuth2Mock).not.toHaveBeenCalled();
  });

  it('does not publish a detached OAuth proof after the session is replaced', async () => {
    let resolveVerification!: (value: { record: { id: string } }) => void;
    verificationAuthWithOAuth2Mock.mockReturnValue(
      new Promise(resolve => {
        resolveVerification = resolve;
      })
    );

    const resultPromise = requestOAuthSignInMethodProof('google', 'link', 'discord', 'user-1');
    expect(verificationAuthWithOAuth2Mock).toHaveBeenCalledOnce();

    sessionState.current = { accountId: 'user-1', generation: 1, epoch: 'epoch-b' };
    resolveVerification({ record: { id: 'user-1' } });

    await expect(resultPromise).resolves.toMatchObject({
      success: false,
      reason: 'account_changed',
    });
    expect(verificationClearMock).toHaveBeenCalledOnce();
  });
});
