import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  describe,
  it,
  expect,
  beforeEach,
} from '../../test-utils';

const { loggerErrorMock, navigateMock, notifyMock, requestVerificationMock, useLocationMock } =
  vi.hoisted(() => ({
    loggerErrorMock: vi.fn(),
    navigateMock: vi.fn(),
    notifyMock: vi.fn(),
    requestVerificationMock: vi.fn(),
    useLocationMock: vi.fn(() => ({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: undefined,
    })),
  }));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => useLocationMock(),
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('@/services/auth', () => ({
  isAuthenticated: () => false,
  getCurrentUserEmail: () => null,
  requestVerification: requestVerificationMock,
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
    error: loggerErrorMock,
  },
}));

import EmailConfirmation from '../EmailConfirmation';

describe('EmailConfirmation page', () => {
  beforeEach(() => {
    loggerErrorMock.mockReset();
    navigateMock.mockReset();
    notifyMock.mockReset();
    requestVerificationMock.mockReset();
    useLocationMock.mockReset().mockReturnValue({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: undefined,
    });
  });

  it('preserves redirect state when returning to login', async () => {
    const user = userEvent.setup();
    useLocationMock.mockReturnValue({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: {
        email: 'test@example.com',
        from: {
          pathname: '/dashboard',
          search: '?status=wishlist',
          hash: '',
        },
      },
    });

    renderWithProviders(<EmailConfirmation />);

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText(/if it is missing or expired/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Back to Login' }));

    expect(navigateMock).toHaveBeenCalledWith('/login', {
      state: {
        from: {
          pathname: '/dashboard',
          search: '?status=wishlist',
          hash: '',
        },
      },
      replace: true,
    });
  });

  it('uses the plain login navigation when no redirect state exists', async () => {
    const user = userEvent.setup();
    useLocationMock.mockReturnValue({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: {
        email: 'test@example.com',
      },
    });

    renderWithProviders(<EmailConfirmation />);

    await user.click(screen.getByRole('button', { name: 'Back to Login' }));

    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('resends verification to the route state email', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockResolvedValue({ success: true });
    useLocationMock.mockReturnValue({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: {
        email: 'test@example.com',
      },
    });

    renderWithProviders(<EmailConfirmation />);

    await user.click(screen.getByRole('button', { name: 'Resend Confirmation Email' }));

    expect(requestVerificationMock).toHaveBeenCalledWith('test@example.com');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'info', title: 'Confirmation email resent' })
    );
  });

  it('reports a resolved verification failure without showing resend success', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockResolvedValue({
      success: false,
      error: 'Private backend response details',
    });
    useLocationMock.mockReturnValue({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: {
        email: 'test@example.com',
      },
    });

    renderWithProviders(<EmailConfirmation />);

    await user.click(screen.getByRole('button', { name: 'Resend Confirmation Email' }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith({
        kind: 'error',
        title: 'Confirmation email resend failed',
        description: 'Failed to resend confirmation email. Please try again later.',
      });
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'info' }));
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ reason: 'resend_verification_failed' })
    );
  });

  it('preserves the thrown resend error in the structured log', async () => {
    const user = userEvent.setup();
    const failure = new Error('verification transport failed');
    requestVerificationMock.mockRejectedValue(failure);
    useLocationMock.mockReturnValue({
      pathname: '/email-confirmation',
      search: '',
      hash: '',
      state: {
        email: 'test@example.com',
      },
    });

    renderWithProviders(<EmailConfirmation />);

    await user.click(screen.getByRole('button', { name: 'Resend Confirmation Email' }));

    await waitFor(() => {
      expect(loggerErrorMock).toHaveBeenCalledWith({
        reason: 'resend_verification_failed',
        error: failure,
      });
    });
    expect(notifyMock).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Confirmation email resend failed',
      description: 'Failed to resend confirmation email. Please try again later.',
    });
  });

  it('does not resend verification when no email can be resolved', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockResolvedValue({ success: true });

    renderWithProviders(<EmailConfirmation />);

    const resendButton = screen.getByRole('button', { name: 'Resend Confirmation Email' });

    expect(resendButton).toBeDisabled();

    await user.click(resendButton);

    expect(requestVerificationMock).not.toHaveBeenCalled();
  });
});
