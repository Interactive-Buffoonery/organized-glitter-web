import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  current: true,
  accountId: 'account-a' as string | null,
  token: 'a',
  clear: vi.fn(),
  drafts: vi.fn(),
  archive: vi.fn(),
  markers: vi.fn(),
  sessionDrafts: vi.fn(),
  cancel: vi.fn(),
  queries: vi.fn(),
  consent: vi.fn(),
  reset: vi.fn(),
  resume: vi.fn(),
  discard: vi.fn(),
  release: vi.fn(),
  completed: vi.fn(),
  sync: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      get record() {
        return mocks.accountId ? { id: mocks.accountId } : null;
      },
      get token() {
        return mocks.token;
      },
      clear: mocks.clear,
    },
  },
}));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ accountId: mocks.accountId, generation: 1, epoch: 'a' }),
  isCurrentSessionIdentity: () => mocks.current,
}));
vi.mock('@/hooks/drafts/formDraftStorage', () => ({ clearAccountDrafts: mocks.drafts }));
vi.mock('@/features/import-export/archive/archiveImportRecovery', () => ({
  clearArchiveImportRecoveryForAccount: mocks.archive,
}));
vi.mock('@/services/auth/sessionRecovery', () => ({
  clearSessionDrafts: mocks.sessionDrafts,
  clearCompletedCreateMarkers: mocks.markers,
  markSessionTokenInactive: vi.fn(),
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { cancelQueries: mocks.cancel, clear: mocks.queries },
}));
vi.mock('@/services/analytics-preference', () => ({
  clearRememberedAnalyticsConsent: mocks.consent,
  syncAnalyticsConsent: mocks.sync,
}));
vi.mock('posthog-js', () => ({ default: { reset: mocks.reset } }));
vi.mock('../analytics', () => ({
  suspendDeletionAnalytics: vi.fn(),
  resumeDeletionAnalytics: mocks.resume,
  discardDeletionAnalyticsQueues: mocks.discard,
  releaseDeletionTransportFence: mocks.release,
  recordCompletedDeletionTransportFence: mocks.completed,
}));
vi.mock('../intentStore', () => ({ deletionIntents: { update: mocks.update } }));
import { finishDeletionCleanup } from '../cleanup';
const intent = () => ({
  version: 1 as const,
  backendUrl: 'http://localhost:8090',
  accountId: 'account-a',
  proof: 'x'.repeat(43),
  phase: 'deleted' as const,
  cleanup: 'pending' as const,
  localCleanupDone: false,
});

describe('confirmed deletion local cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.current = true;
    mocks.accountId = 'account-a';
    mocks.token = 'a';
    mocks.drafts.mockReturnValue(true);
    mocks.archive.mockReturnValue(true);
    mocks.markers.mockReturnValue(true);
    mocks.update.mockImplementation(async value => value);
    mocks.cancel.mockResolvedValue(undefined);
    mocks.clear.mockImplementation(() => {
      mocks.accountId = null;
      mocks.token = '';
    });
  });
  it('never clears drafts or identity for an unconfirmed deletion', async () => {
    await expect(finishDeletionCleanup({ ...intent(), phase: 'pending' })).rejects.toMatchObject({
      reason: 'uncertain',
    });
    expect(mocks.drafts).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('does not touch another account after switching during query cancellation', async () => {
    mocks.cancel.mockImplementation(async () => {
      mocks.current = false;
      mocks.accountId = 'account-b';
    });
    await expect(finishDeletionCleanup(intent())).rejects.toMatchObject({
      reason: 'account_changed',
    });
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.drafts).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it('retains cleanup work when drafts cannot be removed', async () => {
    mocks.drafts.mockReturnValue(false);
    await expect(finishDeletionCleanup(intent())).rejects.toMatchObject({
      reason: 'local_cleanup',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('retains cleanup work when archive recovery cannot be purged', async () => {
    mocks.archive.mockReturnValue(false);
    await expect(finishDeletionCleanup(intent())).rejects.toMatchObject({
      reason: 'local_cleanup',
    });
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('restores signed-out analytics default only after identity reset and consent removal', async () => {
    await expect(finishDeletionCleanup(intent())).resolves.toMatchObject({
      localCleanupDone: true,
      cleanup: 'pending',
    });
    expect(mocks.reset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resume.mock.invocationCallOrder[0]
    );
    expect(mocks.consent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resume.mock.invocationCallOrder[0]
    );
    expect(mocks.sync.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.resume.mock.invocationCallOrder[0]
    );
  });
});
