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
