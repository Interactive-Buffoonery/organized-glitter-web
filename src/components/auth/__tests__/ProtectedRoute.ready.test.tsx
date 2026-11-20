import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAppReadyMock, useHideSplashMock, authState } = vi.hoisted(() => ({
  useAppReadyMock: vi.fn(),
  useHideSplashMock: vi.fn(),
  authState: {
    user: null as { id: string } | null,
    isLoading: true,
    initialCheckComplete: false,
  },
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: (...args: unknown[]) => useAppReadyMock(...args),
  useHideSplash: (...args: unknown[]) => useHideSplashMock(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useLocationMismatchWarning', () => ({
  useLocationMismatchWarning: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => ({ isMobile: true, isTablet: false }),
}));
vi.mock('@/components/ui/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/layout/AuthMenu', () => ({ AuthMenu: () => null }));

import { ProtectedRoute } from '../ProtectedRoute';

describe('ProtectedRoute mount readiness', () => {
  beforeEach(() => {
    useAppReadyMock.mockReset();
    useHideSplashMock.mockReset();
    authState.user = null;
    authState.isLoading = true;
    authState.initialCheckComplete = false;
  });

  it.each([null, { id: 'returning-user' }])(
    'keeps a neutral real header while auth settles for %s',
    user => {
      authState.user = user;
      render(
        <MemoryRouter>
          <ProtectedRoute>
            <div>Protected page</div>
          </ProtectedRoute>
        </MemoryRouter>
      );

      expect(screen.getByRole('banner')).toHaveTextContent('Organized Glitter');
      expect(screen.getByRole('link', { name: 'Organized Glitter home' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Get Started' })).not.toBeInTheDocument();
      expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
      expect(screen.getByText('Organized Glitter')).toHaveClass('inline');
      expect(screen.getByRole('main')).toHaveStyle({
        paddingBottom: 'var(--bottom-nav-total-height)',
      });
      expect(useHideSplashMock).toHaveBeenCalled();
      expect(useHideSplashMock.mock.calls.every(call => call.length === 0)).toBe(true);
      expect(useAppReadyMock).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.getByRole('status').querySelector('.sr-only')).toBeNull();
      expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    }
  );

  it('redirects a resolved signed-out session without exposing protected content', () => {
    authState.isLoading = false;
    authState.initialCheckComplete = true;
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route
            path="/private"
            element={
              <ProtectedRoute>
                <div>Protected page</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });

  it('renders children once an authenticated user is available', () => {
    authState.user = { id: 'user-123' };
    authState.isLoading = false;
    authState.initialCheckComplete = true;

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected page</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected page')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
