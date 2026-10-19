import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  record: vi.fn(),
  discard: vi.fn(),
  release: vi.fn(),
  unowned: vi.fn(),
  finish: vi.fn(),
  clear: vi.fn(),
  current: true,
  token: 'original-session',
  accountId: 'account-a' as string | null,
}));
vi.mock('@/lib/pocketbaseConfig', () => ({ POCKETBASE_URL: 'http://localhost:8090' }));
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      get token() {
        return mocks.token;
      },
      get record() {
        return mocks.accountId ? { id: mocks.accountId } : null;
      },
      onChange: vi.fn(),
      clear: mocks.clear,
    },
  },
}));
vi.mock('../intentStore', () => ({
  deletionIntents: { list: mocks.list, get: mocks.get, finishSignOutIfClaim: mocks.finish },
}));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ accountId: mocks.accountId, epoch: 'epoch-a', generation: 0 }),
  isCurrentSessionIdentity: () => mocks.current,
}));
vi.mock('@/services/auth/sessionRecovery', () => ({
  markSessionTokenInactive: vi.fn(),
  retainSignedOutCreateTokens: vi.fn(),
}));
vi.mock('../analytics', () => ({
  recordCompletedDeletionTransportFence: mocks.record,
  discardDeletionAnalyticsQueues: mocks.discard,
  releaseDeletionTransportFence: mocks.release,
  inspectUnownedDeletionTransportFence: mocks.unowned,
}));
import {
  finishInterruptedSignOut,
  refreshDeletionRecovery,
  useDeletionRecovery,
} from '../recovery';

describe('durable deletion recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token = 'original-session';
    mocks.accountId = 'account-a';
    mocks.current = true;
    mocks.list.mockResolvedValue([]);
    mocks.get.mockResolvedValue(undefined);
    mocks.record.mockReturnValue(true);
    mocks.unowned.mockReturnValue({ checking: false, orphan: false, waitMs: 0 });
    mocks.get.mockResolvedValue({
      kind: 'signed_out',
      backendUrl: 'http://localhost:8090',
      accountId: 'account-a',
      epoch: 'epoch-a',
      claimId: 'claim-a',
    });
    mocks.finish.mockImplementation(async (_backend, _account, _epoch, apply) => apply());
    mocks.clear.mockImplementation(() => {
      mocks.token = '';
      mocks.accountId = null;
    });
  });

  it('reconciles only the exact completed receipt marker before exposing recovery', async () => {
    mocks.list.mockResolvedValue([
      {
        version: 1,
        backendUrl: 'http://localhost:8090',
        accountId: 'account-a',
        proof: 'x'.repeat(43),
        phase: 'deleted',
        cleanup: 'pending',
        localCleanupDone: true,
        transportFenceId: 'fence-a',
      },
    ]);
    const { result } = renderHook(useDeletionRecovery);
    await act(refreshDeletionRecovery);
    expect(mocks.record).toHaveBeenCalledWith('http://localhost:8090', 'account-a', 'fence-a');
    expect(mocks.discard).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledWith('http://localhost:8090', 'account-a', 'fence-a');
    expect(result.current).toMatchObject({ ready: true, error: false });
    mocks.record.mockReturnValue(false);
    await act(refreshDeletionRecovery);
    expect(mocks.discard).toHaveBeenCalledOnce();
  });

  it('surfaces an interrupted sign-out claim without removing or ignoring it', async () => {
    mocks.get.mockResolvedValue({ kind: 'signed_out', accountId: 'account-a' });
    const { result } = renderHook(useDeletionRecovery);
    await act(refreshDeletionRecovery);
    expect(result.current).toMatchObject({ ready: true, claimBlocked: true });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('shows a locked recovery error for an unowned pre-intent fence', async () => {
    mocks.unowned.mockReturnValue({ checking: false, orphan: true, waitMs: 0 });
    const { result } = renderHook(useDeletionRecovery);
    await act(refreshDeletionRecovery);
    expect(result.current).toMatchObject({ ready: true, orphanFence: true });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('finishes only the original interrupted session and retains the claim for sign-in', async () => {
    await finishInterruptedSignOut();
    expect(mocks.finish).toHaveBeenCalledWith(
      'http://localhost:8090',
      'account-a',
      'epoch-a',
      expect.any(Function)
    );
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('keeps a newer account session when storage resolves after the switch', async () => {
    mocks.list.mockImplementation(async () => {
      mocks.token = 'new-session';
      mocks.accountId = 'account-b';
      return [];
    });
    await expect(finishInterruptedSignOut()).rejects.toThrow();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('keeps a newer same-account session at the final claim check', async () => {
    mocks.finish.mockImplementation(async (_backend, _account, _epoch, apply) => {
      mocks.token = 'new-session';
      return apply();
    });
    await expect(finishInterruptedSignOut()).rejects.toThrow();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.token).toBe('new-session');
  });

  it('retains the session when a deletion intent or transport fence appears', async () => {
    mocks.list.mockResolvedValue([{ localCleanupDone: false }]);
    await expect(finishInterruptedSignOut()).rejects.toThrow();
    expect(mocks.finish).not.toHaveBeenCalled();
    mocks.list.mockResolvedValue([]);
    mocks.unowned.mockReturnValue({ checking: false, orphan: true, waitMs: 0 });
    await expect(finishInterruptedSignOut()).rejects.toThrow();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('keeps the original session when private storage fails', async () => {
    mocks.get.mockRejectedValue(new Error('Storage unavailable'));
    await expect(finishInterruptedSignOut()).rejects.toThrow();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.token).toBe('original-session');
  });
});
