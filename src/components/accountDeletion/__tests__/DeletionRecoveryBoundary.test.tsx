import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  localDone: false,
  noIntent: false,
  reset: vi.fn(),
  resume: vi.fn(),
  suspend: vi.fn(),
  sync: vi.fn(),
  consent: vi.fn(),
  discard: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/services/accountDeletion/recovery', () => ({
  useDeletionRecovery: () => ({
    ready: true,
    intents: mocks.noIntent
      ? []
      : [
          {
            accountId: 'account-a',
            phase: mocks.localDone ? 'deleted' : 'pending',
            localCleanupDone: mocks.localDone,
          },
        ],
  }),
}));
vi.mock('@/lib/queryClient', () => ({ queryClient: { cancelQueries: mocks.cancel } }));
vi.mock('posthog-js', () => ({ default: { reset: mocks.reset } }));
vi.mock('@/services/accountDeletion/analytics', () => ({
  isDeletionAnalyticsSuspended: () => true,
  suspendDeletionAnalytics: mocks.suspend,
  discardDeletionAnalyticsQueues: mocks.discard,
  resumeDeletionAnalytics: mocks.resume,
}));
vi.mock('@/services/analytics-preference', () => ({
  clearRememberedAnalyticsConsent: mocks.consent,
  syncAnalyticsConsent: mocks.sync,
}));
import { DeletionRecoveryBoundary } from '../DeletionRecoveryBoundary';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.localDone = false;
  mocks.noIntent = false;
  mocks.cancel.mockResolvedValue(undefined);
});
describe('other-tab deletion completion', () => {
  it('keeps transport suspended while deletion is unresolved', () => {
    render(
      <MemoryRouter initialEntries={['/delete-account']}>
        <DeletionRecoveryBoundary>Recovery</DeletionRecoveryBoundary>
      </MemoryRouter>
    );
    expect(mocks.suspend).toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
  });
  it('resets identity before restoring anonymous capture after another tab finishes cleanup', async () => {
    mocks.localDone = true;
    render(
      <MemoryRouter>
        <DeletionRecoveryBoundary>Home</DeletionRecoveryBoundary>
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.resume).toHaveBeenCalledOnce());
    expect(mocks.reset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resume.mock.invocationCallOrder[0]
    );
    expect(mocks.consent).toHaveBeenCalledWith('account-a');
    expect(mocks.sync).toHaveBeenCalledOnce();
  });
  it('never resets another account identity in response to old-account completion', () => {
    mocks.localDone = true;
    mocks.user = { id: 'account-b' };
    render(
      <MemoryRouter>
        <DeletionRecoveryBoundary>Account B</DeletionRecoveryBoundary>
      </MemoryRouter>
    );
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
  });
  it('resumes retained wire requests after a proven unsent cancellation in another tab', async () => {
    mocks.noIntent = true;
    mocks.user = { id: 'account-a' };
    render(
      <MemoryRouter>
        <DeletionRecoveryBoundary>Account A</DeletionRecoveryBoundary>
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.resume).toHaveBeenCalledOnce());
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledOnce();
  });
});
