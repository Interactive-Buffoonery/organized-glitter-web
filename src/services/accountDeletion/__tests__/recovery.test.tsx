import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  record: vi.fn(),
  discard: vi.fn(),
  release: vi.fn(),
  unowned: vi.fn(),
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
    },
  },
}));
vi.mock('../intentStore', () => ({ deletionIntents: { list: mocks.list, get: mocks.get } }));
vi.mock('../analytics', () => ({
  recordCompletedDeletionTransportFence: mocks.record,
  discardDeletionAnalyticsQueues: mocks.discard,
  releaseDeletionTransportFence: mocks.release,
  inspectUnownedDeletionTransportFence: mocks.unowned,
}));
import { refreshDeletionRecovery, useDeletionRecovery } from '../recovery';

describe('durable deletion recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token = 'original-session';
    mocks.accountId = 'account-a';
    mocks.list.mockResolvedValue([]);
    mocks.get.mockResolvedValue(undefined);
    mocks.record.mockReturnValue(true);
    mocks.unowned.mockReturnValue({ checking: false, orphan: false, waitMs: 0 });
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
});
