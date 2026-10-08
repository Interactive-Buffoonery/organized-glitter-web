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
  loginWithPasswordMock,
  loginWithOAuth2Mock,
  posthogCaptureMock,
  toastMock,
  useAppReadyMock,
  useHideSplashMock,
  authFormPropsMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLocationMock: vi.fn(() => ({
    pathname: '/login',
    search: '',
    hash: '',
    state: undefined,
  })),
  loginWithPasswordMock: vi.fn(),
  loginWithOAuth2Mock: vi.fn(),
  posthogCaptureMock: vi.fn(),
  toastMock: vi.fn(),
  useAppReadyMock: vi.fn(),
  useHideSplashMock: vi.fn(),
  authFormPropsMock: vi.fn(),
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
  default: (props: {
    onSubmit: (data: { email: string; password: string }) => void;
    error?: string;
    verificationEmail?: string;
  }) => {
    authFormPropsMock(props);
    return (
      <button
        type="button"
        onClick={() => props.onSubmit({ email: 'test@example.com', password: 'password123' })}
      >
        Submit login
      </button>
    );
  },
}));

vi.mock('@/components/auth/SocialLogin', () => ({
  default: ({
    onProviderLogin,
  }: {
    onProviderLogin: (provider: 'apple' | 'google' | 'discord') => void;
  }) => (
    <div>
      <button type="button" onClick={() => onProviderLogin('google')}>
        Google login
      </button>
      <button type="button" onClick={() => onProviderLogin('discord')}>
        Discord login
      </button>
      <button type="button" onClick={() => onProviderLogin('apple')}>
        Apple login
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
  loginWithPassword: (...args: unknown[]) => loginWithPasswordMock(...args),
  loginWithOAuth2: (...args: unknown[]) => loginWithOAuth2Mock(...args),
  isAuthenticated: () => true,
  getCurrentUser: () => ({ id: 'user-123' }),
  getCurrentUserId: () => 'user-123',
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

import Login from '../Login';

describe('Login page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useLocationMock.mockReset().mockReturnValue({
      pathname: '/login',
      search: '',
      hash: '',
      state: undefined,
    });
    loginWithPasswordMock.mockReset().mockResolvedValue({ success: true });
    loginWithOAuth2Mock.mockReset().mockResolvedValue({ success: true });
    posthogCaptureMock.mockReset();
    toastMock.mockReset();
    useAppReadyMock.mockReset();
    useHideSplashMock.mockReset();
    authFormPropsMock.mockReset();

    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.initialCheckComplete = true;
  });

  it('redirects already-authenticated users to their preserved destination', async () => {
    authState.isAuthenticated = true;
    useLocationMock.mockReturnValue({
      pathname: '/login',
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

    renderWithProviders(<Login />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard?status=wishlist', { replace: true });
    });
  });

  it('returns password logins to the preserved destination', async () => {
    const user = userEvent.setup();
    useLocationMock.mockReturnValue({
      pathname: '/login',
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

    renderWithProviders(<Login />);

    await user.click(screen.getByRole('button', { name: 'Submit login' }));

    await waitFor(() => {
      expect(loginWithPasswordMock).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(posthogCaptureMock).toHaveBeenCalledWith('auth_login_succeeded', {
        auth_method: 'password',
        auth_provider: 'email',
        auth_entrypoint: 'login',
      });
      expect(navigateMock).toHaveBeenCalledWith('/dashboard?status=wishlist', { replace: true });
    });
  });

  it('passes email verification recovery from a rejected password login to the form', async () => {
    const user = userEvent.setup();
    loginWithPasswordMock.mockResolvedValue({
      success: false,
      error: 'Your email address must be verified before you can sign in.',
      recovery: {
        type: 'email-verification',
        email: 'test@example.com',
      },
    });

    renderWithProviders(<Login />);

    await user.click(screen.getByRole('button', { name: 'Submit login' }));

    await waitFor(() => {
      expect(authFormPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          error: 'Your email address must be verified before you can sign in.',
          verificationEmail: 'test@example.com',
        })
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('returns Google OAuth logins to the preserved destination', async () => {
    const user = userEvent.setup();
    useLocationMock.mockReturnValue({
      pathname: '/login',
      search: '',
      hash: '',
      state: {
        from: {
          pathname: '/projects/abc123',
          search: '',
          hash: '#notes',
        },
      },
    });

    renderWithProviders(<Login />);

    await user.click(screen.getByRole('button', { name: 'Google login' }));

    await waitFor(() => {
      expect(loginWithOAuth2Mock).toHaveBeenCalledWith('google');
      expect(posthogCaptureMock).toHaveBeenCalledWith('auth_login_succeeded', {
        auth_method: 'oauth',
        auth_provider: 'google',
        auth_entrypoint: 'login',
      });
      expect(navigateMock).toHaveBeenCalledWith('/projects/abc123#notes', { replace: true });
    });
  });

  it('signs in with Apple and keeps the OAuth analytics provider', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.click(screen.getByRole('button', { name: 'Apple login' }));

    await waitFor(() => {
      expect(loginWithOAuth2Mock).toHaveBeenCalledWith('apple');
      expect(posthogCaptureMock).toHaveBeenCalledWith('auth_login_succeeded', {
        auth_method: 'oauth',
        auth_provider: 'apple',
        auth_entrypoint: 'login',
      });
    });
  });

  it('falls back to overview when the preserved destination is invalid', async () => {
    authState.isAuthenticated = true;
    useLocationMock.mockReturnValue({
      pathname: '/login',
      search: '',
      hash: '',
      state: {
        from: {
          pathname: 'https://evil.com',
        },
      },
    });

    renderWithProviders(<Login />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/overview', { replace: true });
    });
  });

  it('shows an in-app status spinner while auth is still settling', () => {
    authState.isLoading = true;
    authState.initialCheckComplete = false;

    renderWithProviders(<Login />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status').querySelector('.sr-only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit login' })).not.toBeInTheDocument();
    expect(useHideSplashMock).toHaveBeenCalledWith(true);
    expect(useAppReadyMock).toHaveBeenCalledWith(false);
  });

  it('shows an in-app status spinner while redirecting an already-authenticated user', async () => {
    authState.isAuthenticated = true;

    renderWithProviders(<Login />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status').querySelector('.sr-only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit login' })).not.toBeInTheDocument();
    expect(useHideSplashMock).toHaveBeenCalledWith(true);
    expect(useAppReadyMock).toHaveBeenCalledWith(false);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/overview', { replace: true });
    });
  });

  it('marks the app ready once the login form is shown', () => {
    renderWithProviders(<Login />);

    expect(screen.getByRole('button', { name: 'Submit login' })).toBeInTheDocument();
    expect(useHideSplashMock).toHaveBeenCalledWith(false);
    expect(useAppReadyMock).toHaveBeenCalledWith(true);
  });
});
