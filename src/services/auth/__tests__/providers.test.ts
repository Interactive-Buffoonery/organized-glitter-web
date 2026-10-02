import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authWithOAuth2Mock, listAuthMethodsMock, listExternalAuthsMock, sendMock, saveMock } =
  vi.hoisted(() => ({
    authWithOAuth2Mock: vi.fn(),
    listAuthMethodsMock: vi.fn(),
    listExternalAuthsMock: vi.fn(),
    sendMock: vi.fn(),
    saveMock: vi.fn(),
  }));

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

import {
  connectOAuthProvider,
  listAccountSignInMethods,
  listConfiguredOAuthProviders,
  unlinkOAuthProvider,
} from '../providers';

describe('OAuth provider service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
