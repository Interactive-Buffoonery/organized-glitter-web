import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  beforeEach,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';

const { loginWithOAuth2Mock } = vi.hoisted(() => ({
  loginWithOAuth2Mock: vi.fn(),
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/auth/SocialLogin', () => ({
  default: ({
    onProviderLogin,
  }: {
    onProviderLogin: (provider: 'apple' | 'google' | 'discord') => void;
  }) => (
    <button type="button" onClick={() => onProviderLogin('apple')}>
      Apple signup
    </button>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    initialCheckComplete: true,
  }),
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('@/services/auth', () => ({
  registerWithPassword: vi.fn(),
  loginWithOAuth2: (...args: unknown[]) => loginWithOAuth2Mock(...args),
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
  useHideSplash: vi.fn(),
}));

import Register from '../Register';

describe('Register error display', () => {
  beforeEach(() => {
    loginWithOAuth2Mock.mockReset();
  });

  it('shows an OAuth signup failure once through the real auth form', async () => {
    const user = userEvent.setup();
    const error = 'Apple sign-up could not be completed. Please try again.';
    loginWithOAuth2Mock.mockResolvedValue({ success: false, error });

    renderWithProviders(<Register />, { initialRoute: '/register' });

    await user.click(screen.getByRole('button', { name: 'Apple signup' }));

    await waitFor(() => {
      expect(screen.getAllByText(error)).toHaveLength(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(error);
  });
});
