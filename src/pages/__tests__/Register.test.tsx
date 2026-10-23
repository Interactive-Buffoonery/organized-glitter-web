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

const {
  navigateMock,
  useLocationMock,
  registerWithPasswordMock,
  loginWithOAuth2Mock,
  posthogCaptureMock,
  toastMock,
  useAppReadyMock,
  useHideSplashMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLocationMock: vi.fn(() => ({
    pathname: '/register',
    search: '',
    hash: '',
    state: undefined,
  })),
  registerWithPasswordMock: vi.fn(),
  loginWithOAuth2Mock: vi.fn(),
  posthogCaptureMock: vi.fn(),
  toastMock: vi.fn(),
  useAppReadyMock: vi.fn(),
  useHideSplashMock: vi.fn(),
}));

vi.mock('@/services/analytics-preference', () => ({
  captureAccountAnalyticsEvent: posthogCaptureMock,
}));

const authState = {
  isAuthenticated: false,
  isLoading: false,
  initialCheckComplete: true,
};

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

vi.mock('@/components/auth/AuthForm', () => ({
  default: ({
    onSubmit,
  }: {
    onSubmit: (data: {
      email: string;
      password: string;
      confirmPassword: string;
      username: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          email: 'test@example.com',
          password: 'password123',
          confirmPassword: 'password123',
          username: 'testuser',
        })
      }
    >
      Submit register
    </button>
  ),
}));

vi.mock('@/components/auth/SocialLogin', () => ({
  default: ({
    onProviderLogin,
  }: {
    onProviderLogin: (provider: 'apple' | 'google' | 'discord') => void;
  }) => (
    <div>
      <button type="button" onClick={() => onProviderLogin('google')}>
        Google signup
      </button>
      <button type="button" onClick={() => onProviderLogin('discord')}>
        Discord signup
      </button>
      <button type="button" onClick={() => onProviderLogin('apple')}>
        Apple signup
      </button>
    </div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: posthogCaptureMock }),
}));

vi.mock('@/services/auth', () => ({
  registerWithPassword: (...args: unknown[]) => registerWithPasswordMock(...args),
  loginWithOAuth2: (...args: unknown[]) => loginWithOAuth2Mock(...args),
}));

vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: (...args: unknown[]) => useAppReadyMock(...args),
  useHideSplash: (...args: unknown[]) => useHideSplashMock(...args),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

import Register from '../Register';

describe('Register page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useLocationMock.mockReset().mockReturnValue({
      pathname: '/register',
      search: '',
      hash: '',
      state: undefined,
    });
    registerWithPasswordMock.mockReset().mockResolvedValue({ success: true });
    loginWithOAuth2Mock.mockReset().mockResolvedValue({ success: true });
    posthogCaptureMock.mockReset();
    toastMock.mockReset();
    useAppReadyMock.mockReset();
    useHideSplashMock.mockReset();

    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.initialCheckComplete = true;
  });

  it('carries the preserved destination through email confirmation after registration', async () => {
    const user = userEvent.setup();
    useLocationMock.mockReturnValue({
      pathname: '/register',
      search: '',
      hash: '',
      state: {
        from: {
          pathname: '/dashboard',
          search: '?status=wishlist',
          hash: '',
        },
      },
    });

    renderWithProviders(<Register />);

    await user.click(screen.getByRole('button', { name: 'Submit register' }));

    await waitFor(() => {
      expect(registerWithPasswordMock).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        username: 'testuser',
      });
      expect(posthogCaptureMock).toHaveBeenCalledWith('registration_started', {
        auth_method: 'password',
        auth_provider: 'email',
        auth_entrypoint: 'register',
      });
      expect(posthogCaptureMock).toHaveBeenCalledWith('auth_registration_succeeded', {
        auth_method: 'password',
        auth_provider: 'email',
        auth_entrypoint: 'register',
        requires_email_verification: true,
      });
      expect(navigateMock).toHaveBeenCalledWith('/email-confirmation', {
        state: {
          email: 'test@example.com',
          from: {
            pathname: '/dashboard',
            search: '?status=wishlist',
            hash: '',
          },
        },
        replace: true,
      });
    });
  });
});
