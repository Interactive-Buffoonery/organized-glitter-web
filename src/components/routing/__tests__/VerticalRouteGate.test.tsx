import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAppReadyMock, useHideSplashMock, authState, enabledVerticalsState } = vi.hoisted(() => ({
  useAppReadyMock: vi.fn(),
  useHideSplashMock: vi.fn(),
  authState: {
    user: { id: 'user-123' } as { id: string } | null,
  },
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: true,
  },
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: (...args: unknown[]) => useAppReadyMock(...args),
  useHideSplash: (...args: unknown[]) => useHideSplashMock(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

import { VerticalRouteGate } from '../AppRoutes';

describe('VerticalRouteGate', () => {
  beforeEach(() => {
    useAppReadyMock.mockReset();
    useHideSplashMock.mockReset();
    authState.user = { id: 'user-123' };
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = true;
  });

  it('hides splash without marking ready while verticals resolve', () => {
    render(
      <MemoryRouter>
        <VerticalRouteGate requiredVertical="coloring_books">
          <div>Protected coloring page</div>
        </VerticalRouteGate>
      </MemoryRouter>
    );

    expect(useHideSplashMock).toHaveBeenCalled();
    expect(useHideSplashMock.mock.calls.every(call => call.length === 0)).toBe(true);
    expect(useAppReadyMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status').querySelector('.sr-only')).toBeNull();
    expect(screen.queryByText('Protected coloring page')).not.toBeInTheDocument();
  });

  it('renders children once vertical access is available', () => {
    enabledVerticalsState.isLoading = false;

    render(
      <MemoryRouter>
        <VerticalRouteGate requiredVertical="coloring_books">
          <div>Protected coloring page</div>
        </VerticalRouteGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected coloring page')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
