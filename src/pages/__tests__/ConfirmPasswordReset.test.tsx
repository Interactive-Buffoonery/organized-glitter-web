import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  waitFor,
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
});
