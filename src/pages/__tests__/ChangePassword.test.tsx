import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  fireEvent,
  describe,
  it,
  expect,
  beforeEach,
  act,
  userEvent,
} from '../../test-utils';

const { navigateMock, changePasswordMock, signOutMock, toastMock, clearAccountDraftsMock } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    changePasswordMock: vi.fn(),
    signOutMock: vi.fn(),
    toastMock: vi.fn(),
    clearAccountDraftsMock: vi.fn(),
  }));

const authState = {
  user: { id: 'user-123', email: 'test@example.com' },
  signOut: signOutMock,
};

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/services/auth', () => ({
  changePassword: (...args: unknown[]) => changePasswordMock(...args),
}));

vi.mock('@/services/errors', () => ({
  hasErrorStatus: vi.fn(() => false),
  getErrorMessage: vi.fn(() => ''),
}));

vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
}));

vi.mock('@/hooks/drafts/formDraftStorage', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/drafts/formDraftStorage')>();
  return { ...actual, clearAccountDrafts: clearAccountDraftsMock };
});

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    criticalError: vi.fn(),
  }),
  logger: {
    criticalError: vi.fn(),
  },
}));

import ChangePassword from '../ChangePassword';

describe('ChangePassword page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    changePasswordMock.mockReset().mockResolvedValue({ success: true });
    signOutMock.mockReset().mockResolvedValue(undefined);
    toastMock.mockReset();
    clearAccountDraftsMock.mockReset().mockReturnValue(true);
    authState.user = { id: 'user-123', email: 'test@example.com' };
  });

  it('schedules sign-out and redirect after a successful password change', async () => {
    let redirectCallback: (() => Promise<void>) | undefined;
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(callback => {
      redirectCallback = callback as () => Promise<void>;
      return 789 as never;
    });
    renderWithProviders(<ChangePassword />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'CurrentPass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await Promise.resolve();
    await Promise.resolve();

    expect(changePasswordMock).toHaveBeenCalledWith(
      'CurrentPass123',
      'ValidPass123',
      'ValidPass123'
    );

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
    expect(redirectCallback).toBeDefined();
    await redirectCallback?.();
    expect(signOutMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/login');
    setTimeoutSpy.mockRestore();
  });

  it('clears the delayed sign-out on unmount', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(789 as never);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderWithProviders(<ChangePassword />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'CurrentPass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await Promise.resolve();
    await Promise.resolve();

    expect(changePasswordMock).toHaveBeenCalled();

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(789);
    expect(signOutMock).not.toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  it('clears drafts before a delayed sign-out can be canceled', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(789 as never);
    const { unmount } = renderWithProviders(<ChangePassword />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'CurrentPass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(clearAccountDraftsMock).toHaveBeenCalledWith({
      backendUrl: expect.any(String),
      accountId: 'user-123',
    });
    expect(signOutMock).not.toHaveBeenCalled();

    unmount();
    expect(signOutMock).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('names each password visibility control and exposes its state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePassword />);

    const currentToggle = screen.getByRole('button', { name: 'Show current password' });
    const newToggle = screen.getByRole('button', { name: 'Show new password' });
    const confirmToggle = screen.getByRole('button', { name: 'Show confirm new password' });

    for (const toggle of [currentToggle, newToggle, confirmToggle]) {
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(toggle).toHaveAttribute('type', 'button');
    }

    newToggle.focus();
    await user.keyboard(' ');

    expect(screen.getByRole('button', { name: 'Show new password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Current Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm New Password')).toHaveAttribute('type', 'password');
  });

  it('announces an inline password validation error', () => {
    renderWithProviders(<ChangePassword />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'CurrentPass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'DifferentPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-reason', 'password-mismatch');
    expect(alert).toHaveTextContent('New passwords do not match');
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('announces a failed password change', async () => {
    changePasswordMock.mockRejectedValue(new Error('Connection failed'));
    renderWithProviders(<ChangePassword />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'CurrentPass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-reason', 'request-failed');
    expect(alert).toHaveTextContent('Connection failed');
    expect(changePasswordMock).toHaveBeenCalledOnce();
  });

  it('preserves a structured service reason without exposing its token', async () => {
    changePasswordMock.mockResolvedValue({
      success: false,
      reason: 'session_required',
      error: 'Your session expired. Please sign in again.',
    });
    renderWithProviders(<ChangePassword />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'CurrentPass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-reason', 'session_required');
    expect(alert).not.toHaveTextContent('session_required');
  });
});
