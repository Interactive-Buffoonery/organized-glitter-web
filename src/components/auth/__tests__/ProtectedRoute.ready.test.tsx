import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
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

import { ProtectedRoute } from '../ProtectedRoute';

describe('ProtectedRoute mount readiness', () => {
  beforeEach(() => {
    useAppReadyMock.mockReset();
    useHideSplashMock.mockReset();
    authState.user = null;
    authState.isLoading = true;
    authState.initialCheckComplete = false;
  });

  it('hides splash without marking ready while auth settles', () => {
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected page</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(useHideSplashMock).toHaveBeenCalled();
    expect(useHideSplashMock.mock.calls.every(call => call.length === 0)).toBe(true);
    expect(useAppReadyMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status').querySelector('.sr-only')).toBeNull();
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
