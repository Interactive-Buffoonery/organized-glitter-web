import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAppReadyMock, useHideSplashMock, authState } = vi.hoisted(() => ({
  useAppReadyMock: vi.fn(),
  useHideSplashMock: vi.fn(),
  authState: {
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

vi.mock('@/pages/Home', () => ({
  default: () => <div>Home page</div>,
}));

import { RootRoute } from '../RootRoute';

describe('RootRoute mount readiness', () => {
  beforeEach(() => {
    useAppReadyMock.mockReset();
    useHideSplashMock.mockReset();
    authState.isLoading = true;
    authState.initialCheckComplete = false;
  });

  it('hides splash without marking ready while auth settles', () => {
    render(<RootRoute />);

    expect(useHideSplashMock).toHaveBeenCalled();
    expect(useHideSplashMock.mock.calls.every(call => call.length === 0)).toBe(true);
    expect(useAppReadyMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status').querySelector('.sr-only')).toBeNull();
    expect(screen.queryByText('Home page')).not.toBeInTheDocument();
  });

  it('renders Home once auth has settled', () => {
    authState.isLoading = false;
    authState.initialCheckComplete = true;

    render(<RootRoute />);

    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
