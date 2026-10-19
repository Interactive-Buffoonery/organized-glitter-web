import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  store: { create: vi.fn(), update: vi.fn(), get: vi.fn() },
  identity: { accountId: 'account-a', generation: 1, epoch: 'epoch-a' },
  current: true,
  token: 'test-session',
  stop: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/services/accountDeletion/intentStore', () => ({ deletionIntents: mocks.store }));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => mocks.identity,
  isCurrentSessionIdentity: () => mocks.current,
}));
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      get token() {
        return mocks.token;
      },
    },
  },
}));
vi.mock('@/lib/pocketbaseConfig', () => ({ POCKETBASE_URL: 'http://localhost:8090' }));
vi.mock('@/services/accountDeletion/analytics', () => ({ suspendDeletionAnalytics: mocks.stop }));
vi.mock('@/lib/queryClient', () => ({ queryClient: { cancelQueries: mocks.cancel } }));
import { AccountDeletionService } from '../accountDeletion.service';

const proof = () => ({
  action: 'delete_account' as const,
  accountId: 'account-a',
  value: 'x'.repeat(43),
  identity: mocks.identity,
  expiresAt: Date.now() + 300_000,
});
const intent = () => ({
  version: 1 as const,
  backendUrl: 'http://localhost:8090',
  accountId: 'account-a',
  proof: 'x'.repeat(43),
  phase: 'pending' as const,
  cleanup: 'pending' as const,
  localCleanupDone: false,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('guarded account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.current = true;
    mocks.token = 'test-session';
    mocks.store.create.mockImplementation(async value => value);
    mocks.store.update.mockImplementation(async value => value);
    mocks.store.get.mockResolvedValue(intent());
    mocks.cancel.mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ status: 'deleted', cleanup: 'pending' }))
    );
  });

  it('commits intent before exactly one guarded POST with only the wire contract', async () => {
    await expect(AccountDeletionService.deleteAccount(proof())).resolves.toMatchObject({
      phase: 'deleted',
      cleanup: 'pending',
    });
    expect(mocks.store.create).toHaveBeenCalledOnce();
    expect(mocks.store.create.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0]
    );
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:8090/api/account/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ proof: 'x'.repeat(43), confirmed: true }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
      })
    );
  });

  it('does not send when durable storage is unavailable', async () => {
    mocks.store.create.mockRejectedValue(new Error('quota'));
    await expect(AccountDeletionService.deleteAccount(proof())).rejects.toMatchObject({
      reason: 'storage',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not replace an intent already admitted by another tab', async () => {
    mocks.store.create.mockResolvedValue({ ...intent(), proof: 'y'.repeat(43) });
    await expect(AccountDeletionService.deleteAccount(proof())).rejects.toMatchObject({
      reason: 'pending',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['persistence', 'query cancellation'])('fences the session after %s', async boundary => {
    (boundary === 'persistence' ? mocks.store.create : mocks.cancel).mockImplementation(
      async value => {
        mocks.current = false;
        return value;
      }
    );
    await expect(AccountDeletionService.deleteAccount(proof())).rejects.toMatchObject({
      reason: 'account_changed',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects stale fresh authorization before persisting or sending', async () => {
    await expect(
      AccountDeletionService.deleteAccount({ ...proof(), expiresAt: Date.now() - 1 })
    ).rejects.toMatchObject({ reason: 'verification' });
    expect(mocks.store.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])(
    'retains uncertain intent after HTTP %i and never refreshes or replays',
    async status => {
      vi.mocked(fetch).mockResolvedValue(response({ message: 'rejected' }, status));
      await expect(AccountDeletionService.deleteAccount(proof())).rejects.toMatchObject({
        reason: 'uncertain',
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(mocks.store.update).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { status: 'deleted' },
    { status: 'deleted', cleanup: 'unknown' },
    { status: 'already_deleted', cleanup: 'completed' },
  ])('treats malformed success as uncertain', async body => {
    vi.mocked(fetch).mockResolvedValue(response(body));
    await expect(AccountDeletionService.retry(intent())).rejects.toMatchObject({
      reason: 'uncertain',
    });
    expect(mocks.store.update).not.toHaveBeenCalled();
  });

  it('recovers the same proof without the current session or its expired token', async () => {
    mocks.current = false;
    mocks.token = 'another-account-session';
    await AccountDeletionService.retry(intent());
    const options = vi.mocked(fetch).mock.calls[0][1]!;
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
    expect(options.credentials).toBe('omit');
    expect(options.body).toBe(JSON.stringify({ proof: intent().proof, confirmed: true }));
  });

  it('retains pending intent on lost response', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network'));
    await expect(AccountDeletionService.retry(intent())).rejects.toMatchObject({
      reason: 'uncertain',
    });
    expect(mocks.store.update).not.toHaveBeenCalled();
  });

  it('saves confirmed deletion independently from a changed interactive session', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      mocks.current = false;
      return response({ status: 'deleted', cleanup: 'completed' });
    });
    await expect(AccountDeletionService.deleteAccount(proof())).resolves.toMatchObject({
      phase: 'deleted',
      cleanup: 'completed',
    });
    expect(mocks.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-a', phase: 'deleted' })
    );
  });
});
