import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  fireEvent,
  describe,
  it,
  expect,
  beforeEach,
} from '../../test-utils';

const { navigateMock, confirmPasswordResetMock, toastMock, useParamsMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  confirmPasswordResetMock: vi.fn(),
  toastMock: vi.fn(),
  useParamsMock: vi.fn(() => ({ token: 'abc123token99' })),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/services/auth', () => ({
  confirmPasswordReset: (...args: unknown[]) => confirmPasswordResetMock(...args),
}));

vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
  logger: {
    error: vi.fn(),
  },
}));

import ConfirmPasswordReset from '../ConfirmPasswordReset';

describe('ConfirmPasswordReset page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    confirmPasswordResetMock.mockReset().mockResolvedValue({ success: true });
    toastMock.mockReset();
    useParamsMock.mockReset().mockReturnValue({ token: 'abc123token99' });
  });

  it('uses the shared strong password policy', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmPasswordReset />);

    await user.type(screen.getByLabelText('New Password'), 'weakpass1');
    await user.type(screen.getByLabelText('Confirm New Password'), 'weakpass1');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Password must contain at least one uppercase letter/)
      ).toBeInTheDocument();
    });
    expect(confirmPasswordResetMock).not.toHaveBeenCalled();
  });

  it('announces validation errors and associates them with invalid fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmPasswordReset />);

    await user.type(screen.getByLabelText('New Password'), 'ValidPass123');
    await user.type(screen.getByLabelText('Confirm New Password'), 'DifferentPass123');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    const error = await screen.findByRole('alert');
    const password = screen.getByLabelText('New Password');
    const confirmation = screen.getByLabelText('Confirm New Password');

    expect(error).toHaveAttribute('id', 'password-reset-error');
    expect(error).toHaveTextContent('Passwords do not match');
    expect(password).toHaveAttribute('aria-invalid', 'false');
    expect(password).toHaveAttribute('aria-describedby', 'password-reset-error');
    expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    expect(confirmation).toHaveAttribute('aria-describedby', 'password-reset-error');
  });

  it('schedules a redirect to login after a successful reset', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    renderWithProviders(<ConfirmPasswordReset />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(confirmPasswordResetMock).toHaveBeenCalledWith(
        'abc123token99',
        'ValidPass123',
        'ValidPass123'
      );
      expect(screen.getByRole('heading', { name: 'Password Reset Complete' })).toBeInTheDocument();
    });

    const redirectCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 3000);
    expect(redirectCall).toBeDefined();
    const redirectCallback = redirectCall?.[0] as (() => void) | undefined;
    redirectCallback?.();
    expect(navigateMock).toHaveBeenCalledWith('/login');
    setTimeoutSpy.mockRestore();
  });

  it('shows the expired link message when reset confirmation rejects the token', async () => {
    confirmPasswordResetMock.mockResolvedValue({
      success: false,
      error: 'token is invalid or expired',
    });

    renderWithProviders(<ConfirmPasswordReset />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid or expired reset link. Please request a new password reset.'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Request New Reset Link' }));
    expect(navigateMock).toHaveBeenCalledWith('/forgot-password');
  });

  it('shows the same recovery path when the reset token is already used', async () => {
    confirmPasswordResetMock.mockResolvedValue({
      success: false,
      error: 'The requested resource was not found.',
    });

    renderWithProviders(<ConfirmPasswordReset />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(
        screen.getByText('Invalid or expired reset link. Please request a new password reset.')
      ).toBeInTheDocument();
    });
  });

  it('redirects a missing token to request a new reset link', async () => {
    useParamsMock.mockReturnValue({});

    renderWithProviders(<ConfirmPasswordReset />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/forgot-password');
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'Invalid or expired link',
        })
      );
    });
    expect(confirmPasswordResetMock).not.toHaveBeenCalled();
  });

  it('clears the redirect timer on unmount', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const { unmount } = renderWithProviders(<ConfirmPasswordReset />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'ValidPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(confirmPasswordResetMock).toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Password Reset Complete' })).toBeInTheDocument();
    });

    const redirectCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 3000);
    expect(redirectCall).toBeDefined();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });
});
