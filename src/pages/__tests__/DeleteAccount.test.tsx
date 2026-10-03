import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, deleteAccountMock, navigateMock, notifyMock, signOutMock } = vi.hoisted(() => ({
  authState: {
    user: {
      id: 'user12345678901',
      email: 'sarah@example.test',
      username: 'sarah',
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
    },
    signOut: vi.fn(),
  },
  deleteAccountMock: vi.fn(),
  navigateMock: vi.fn(),
  notifyMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('@/services/pocketbase/accountDeletion.service', () => ({
  AccountDeletionService: {
    deleteAccount: deleteAccountMock,
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import DeleteAccount from '../DeleteAccount';

describe('DeleteAccount', () => {
  beforeEach(() => {
    deleteAccountMock.mockReset();
    navigateMock.mockReset();
    notifyMock.mockReset();
    signOutMock.mockReset();
    authState.signOut = signOutMock;
    authState.user = {
      id: 'user12345678901',
      email: 'sarah@example.test',
      username: 'sarah',
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
    };
    deleteAccountMock.mockResolvedValue({ status: 'deleted' });
    signOutMock.mockResolvedValue({ success: true, error: null });
  });

  it('delegates deletion to the account deletion service and clears the session', async () => {
    const user = userEvent.setup();

    render(<DeleteAccount />);

    await user.type(screen.getByLabelText(/feedback/i), 'I am leaving notes');
    await user.click(
      screen.getByLabelText('I understand that this action is permanent and cannot be undone')
    );
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(deleteAccountMock).toHaveBeenCalledWith({
        user: authState.user,
        notes: 'I am leaving notes',
      });
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      kind: 'info',
      title: 'Account deleted successfully',
      description: 'Your account and all related data have been permanently removed.',
    });
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows the already deleted success message and clears the session', async () => {
    const user = userEvent.setup();
    deleteAccountMock.mockResolvedValue({ status: 'already_deleted' });

    render(<DeleteAccount />);

    await user.click(
      screen.getByLabelText('I understand that this action is permanent and cannot be undone')
    );
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith({
        kind: 'info',
        title: 'Account already deleted',
        description: 'Your account was already deleted. Your local session has been cleared.',
      });
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it.each([
    ['throws', () => signOutMock.mockRejectedValue(new Error('logout failed'))],
    [
      'returns a failure result',
      () => signOutMock.mockResolvedValue({ success: false, error: new Error('logout failed') }),
    ],
  ])('shows a cleanup failure after deletion succeeds when sign out %s', async (_, failSignOut) => {
    const user = userEvent.setup();
    failSignOut();

    render(<DeleteAccount />);

    await user.click(
      screen.getByLabelText('I understand that this action is permanent and cannot be undone')
    );
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(deleteAccountMock).toHaveBeenCalledWith({
        user: authState.user,
        notes: '',
      });
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Account deleted',
      description:
        'Your account was deleted, but this device session could not be cleared. Please refresh or sign in again.',
    });
    expect(notifyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Failed to delete your account. Please try again or contact support.',
      })
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows the captured-audit failure message without signing out', async () => {
    const user = userEvent.setup();
    deleteAccountMock.mockRejectedValue({
      type: 'permission',
      message:
        'Your deletion request was captured, but account removal could not finish. Please contact support.',
      status: 403,
      details: {
        auditCaptured: true,
      },
    });

    render(<DeleteAccount />);

    await user.click(
      screen.getByLabelText('I understand that this action is permanent and cannot be undone')
    );
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith({
        kind: 'error',
        title: 'Error',
        description:
          'Your deletion request was captured, but account removal could not finish. Please contact support.',
      });
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows a network failure message without signing out', async () => {
    const user = userEvent.setup();
    deleteAccountMock.mockRejectedValue({
      type: 'network',
      message: 'fetch failed',
    });

    render(<DeleteAccount />);

    await user.click(
      screen.getByLabelText('I understand that this action is permanent and cannot be undone')
    );
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith({
        kind: 'error',
        title: 'Error',
        description: 'Network connection failed. Please check your connection and try again.',
      });
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
