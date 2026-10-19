import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  accountId: 'account-a' as string | null,
  intents: [] as unknown[],
  verify: vi.fn(),
  oauth: vi.fn(),
  methods: vi.fn(),
  remove: vi.fn(),
  removeIntent: vi.fn(),
  retry: vi.fn(),
  authenticatedRetry: vi.fn(),
  cleanup: vi.fn(),
  identity: { accountId: 'account-a', generation: 1, epoch: 'a' },
  current: true,
  storageError: false,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.accountId ? { id: mocks.accountId } : null }),
}));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/hooks/usePageMetadata', () => ({ useNoIndexPage: vi.fn() }));
vi.mock('@/services/accountDeletion/recovery', () => ({
  useDeletionRecovery: () => ({ ready: true, intents: mocks.intents, error: mocks.storageError }),
}));
vi.mock('@/services/auth/accountDeletion', () => ({
  requestDeletionPasswordProof: mocks.verify,
  requestDeletionOAuthProof: mocks.oauth,
}));
vi.mock('@/services/auth/providers', () => ({ listAccountSignInMethods: mocks.methods }));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => mocks.identity,
  isCurrentSessionIdentity: () => mocks.current,
}));
vi.mock('@/services/pocketbase/accountDeletion.service', () => ({
  AccountDeletionService: {
    deleteAccount: mocks.remove,
    retry: mocks.retry,
    retryAuthenticated: mocks.authenticatedRetry,
  },
}));
vi.mock('@/services/accountDeletion/cleanup', () => ({ finishDeletionCleanup: mocks.cleanup }));
vi.mock('@/services/accountDeletion/intentStore', () => ({
  deletionIntents: { remove: mocks.removeIntent, cancelPrepared: vi.fn() },
}));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
import DeleteAccount from '../DeleteAccount';
const intent = () => ({
  version: 1,
  backendUrl: 'http://localhost:8090',
  accountId: 'account-a',
  proof: 'x'.repeat(43),
  phase: 'pending',
  cleanup: 'pending',
  localCleanupDone: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountId = 'account-a';
  mocks.intents = [];
  mocks.current = true;
  mocks.storageError = false;
  mocks.removeIntent.mockResolvedValue(undefined);
  mocks.methods.mockResolvedValue([
    { provider: 'google', label: 'Google', configured: true, linked: true },
    { provider: 'discord', label: 'Discord', configured: true, linked: false },
  ]);
  mocks.verify.mockResolvedValue({
    success: true,
    proof: {
      action: 'delete_account',
      accountId: 'account-a',
      identity: mocks.identity,
      value: 'x'.repeat(43),
      expiresAt: Date.now() + 300_000,
    },
  });
  mocks.remove.mockResolvedValue({ ...intent(), phase: 'deleted' });
  mocks.retry.mockResolvedValue({ ...intent(), phase: 'deleted' });
  mocks.authenticatedRetry.mockResolvedValue({ ...intent(), phase: 'deleted' });
  mocks.cleanup.mockImplementation(async value => ({ ...value, localCleanupDone: true }));
});
async function verifyAndDelete() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Current password'), 'test-password');
  await user.click(screen.getByRole('button', { name: 'Verify password' }));
  await user.click(screen.getByLabelText('I understand that this permanently deletes my account'));
  await user.click(screen.getByRole('button', { name: 'Delete my account' }));
}

describe('account deletion state machine', () => {
  it('requires separate fresh auth and confirmation and offers only connected OAuth methods', async () => {
    render(<DeleteAccount />);
    expect(await screen.findByRole('button', { name: 'Delete my account' })).toBeDisabled();
    expect(screen.queryByLabelText(/feedback/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Verify with Google' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Verify with Discord' })).not.toBeInTheDocument();
    await verifyAndDelete();
    await waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Account deleted');
    expect(screen.getByRole('status')).toHaveTextContent('Additional cleanup');
  });
  it('preserves work on ambiguous response and provides tokenless recovery without signing in', async () => {
    mocks.accountId = null;
    mocks.intents = [intent()];
    mocks.retry.mockRejectedValue(new Error('private response'));
    render(<DeleteAccount />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check deletion status' }));
    expect(mocks.retry).toHaveBeenCalledWith(intent());
    expect(await screen.findByRole('status')).toHaveTextContent('not confirmed');
    expect(screen.getByRole('status')).not.toHaveTextContent('not been deleted');
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent('private response');
  });
  it('keeps server deletion distinct from failed local cleanup', async () => {
    mocks.cleanup.mockRejectedValue(new Error('storage'));
    render(<DeleteAccount />);
    await verifyAndDelete();
    expect(await screen.findByRole('button', { name: 'Retry local cleanup' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Account deleted');
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it('does not act on a verification response from an old session', async () => {
    mocks.verify.mockImplementation(async () => {
      mocks.current = false;
      return { success: true, proof: {} };
    });
    render(<DeleteAccount />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Current password'), 'test-password');
    await user.click(screen.getByRole('button', { name: 'Verify password' }));
    await user.click(
      screen.getByLabelText('I understand that this permanently deletes my account')
    );
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
  });
  it('offers a retry when linked provider discovery fails', async () => {
    mocks.methods.mockRejectedValueOnce(new Error('offline'));
    render(<DeleteAccount />);
    expect(await screen.findByRole('alert')).toHaveTextContent('sign-in methods');
    await userEvent.click(screen.getByRole('button', { name: 'Retry sign-in methods' }));
    expect(await screen.findByRole('button', { name: 'Verify with Google' })).toBeVisible();
  });
  it('selects an unresolved signed-out receipt ahead of a completed receipt', async () => {
    mocks.accountId = null;
    mocks.intents = [
      { ...intent(), accountId: 'account-a', phase: 'deleted', localCleanupDone: true },
      { ...intent(), accountId: 'account-b', proof: 'b'.repeat(43) },
    ];
    render(<DeleteAccount />);
    await userEvent.click(screen.getByRole('button', { name: 'Check deletion status' }));
    expect(mocks.retry).toHaveBeenCalledWith(mocks.intents[1]);
  });
  it('announces slow verification and moves focus to a resolved state', async () => {
    let release!: (value: unknown) => void;
    mocks.verify.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      })
    );
    render(<DeleteAccount />);
    await userEvent.type(screen.getByLabelText('Current password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Verify password' }));
    expect(screen.getByRole('status')).toHaveTextContent('Verifying your identity');
    release({ success: false, error: 'Try again.' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Delete your account' })).toHaveFocus()
    );
  });
  it('keeps a first-send failure in recovery even when the session epoch changes', async () => {
    mocks.remove.mockImplementation(async () => {
      mocks.current = false;
      throw new Error('network');
    });
    render(<DeleteAccount />);
    await verifyAndDelete();
    expect(await screen.findByRole('status')).toHaveTextContent('not confirmed');
  });
  it('finishes a completed receipt and removes the stale result panel', async () => {
    mocks.accountId = null;
    mocks.intents = [
      { ...intent(), phase: 'deleted', cleanup: 'completed', localCleanupDone: true },
    ];
    render(<DeleteAccount />);
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Recovery is complete');
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
  });
  it('offers local cleanup retry only after confirmed deletion', async () => {
    mocks.accountId = null;
    mocks.intents = [{ ...intent(), phase: 'deleted' }];
    render(<DeleteAccount />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry local cleanup' }));
    await waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce());
  });
  it('keeps deletion controls disabled when recovery storage has failed', async () => {
    mocks.storageError = true;
    render(<DeleteAccount />);
    await screen.findByRole('button', { name: 'Verify with Google' });
    expect(screen.getByRole('alert')).toHaveTextContent('Private browser storage is unavailable');
    expect(screen.getByRole('button', { name: 'Verify password' })).toBeDisabled();
  });
  it('offers only a linked OAuth method for verification', async () => {
    render(<DeleteAccount />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify with Google' }));
    expect(mocks.oauth).toHaveBeenCalledWith('google', 'account-a', undefined);
  });
});

it('keeps confirmed deletion when a later vendor status check fails', async () => {
  mocks.accountId = null;
  mocks.intents = [{ ...intent(), phase: 'deleted', localCleanupDone: true }];
  mocks.retry.mockRejectedValue(new Error('offline'));
  render(<DeleteAccount />);
  await userEvent.click(await screen.findByRole('button', { name: 'Check deletion status' }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledOnce());
  expect(screen.getByRole('status')).toHaveTextContent('Account deleted');
  expect(document.body).not.toHaveTextContent('Deletion is not confirmed');
});
