import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  waitFor,
  describe,
  it,
  expect,
  beforeEach,
} from '../../test-utils';

const { navigateMock, confirmEmailVerificationMock, toastMock, useParamsMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  confirmEmailVerificationMock: vi.fn(),
  toastMock: vi.fn(),
  useParamsMock: vi.fn(() => ({ token: 'verify-token-123' })),
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
  confirmEmailVerification: (...args: unknown[]) => confirmEmailVerificationMock(...args),
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

import VerifyEmail from '../VerifyEmail';

describe('VerifyEmail page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    confirmEmailVerificationMock.mockReset().mockResolvedValue({ success: true });
    toastMock.mockReset();
    useParamsMock.mockReset().mockReturnValue({ token: 'verify-token-123' });
  });

  it('schedules a redirect to login after successful verification', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    renderWithProviders(<VerifyEmail />);

    await waitFor(() => {
      expect(confirmEmailVerificationMock).toHaveBeenCalledWith('verify-token-123');
      expect(screen.getByText(/Email Verified!/)).toBeInTheDocument();
    });

    const redirectCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 3000);
    expect(redirectCall).toBeDefined();
    const redirectCallback = redirectCall?.[0] as (() => void) | undefined;
    expect(redirectCallback).toBeDefined();
    redirectCallback?.();
    expect(navigateMock).toHaveBeenCalledWith('/login');
    setTimeoutSpy.mockRestore();
  });

  it('clears the redirect timer on unmount', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const { unmount } = renderWithProviders(<VerifyEmail />);

    await waitFor(() => {
      expect(confirmEmailVerificationMock).toHaveBeenCalled();
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
