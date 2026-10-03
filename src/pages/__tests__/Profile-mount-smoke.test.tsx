/**
 * Profile route-mount smoke test.
 *
 * Mounts /profile with the real Radix Tabs surface and asserts no render-loop
 * errors. Profile is the densest Tabs instance in the app (Data, Preferences,
 * Company List, Artist List, Tag List), plus child sections that each have
 * their own Radix primitives (TimezonePreferences uses a Select, AvatarManager
 * uses a Dialog). Any Radix regression would likely show here first.
 *
 * This test intentionally does NOT click through every tab; that's what the
 * per-tab unit tests are for. The point here is "the page mounts cleanly".
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../../test-utils';
import {
  installRenderLoopGuard,
  assertNoRenderLoop,
  ERROR_BOUNDARY_FALLBACK_PATTERNS,
} from '../../test-utils/renderLoopGuard';

const guard = installRenderLoopGuard();

const defaultUser = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'tester',
  verified: true,
};

const { notifyMock, authState, userProfile, avatarState } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
  authState: {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'tester',
      verified: true,
    } as {
      id: string;
      email: string;
      username: string;
      verified: boolean;
    } | null,
    isAuthenticated: true,
    initialCheckComplete: true,
    isLoading: false,
  },
  userProfile: {
    id: 'user-123',
    email: 'test@example.com',
    username: 'tester',
    verified: true,
    avatar: undefined,
    avatar_config: null,
    beta_tester: true,
    timezone: 'America/New_York',
    created: '2025-01-01T00:00:00.000Z',
    updated: '2025-01-01T00:00:00.000Z',
  },
  avatarState: {
    avatarUrl: undefined,
    avatarConfig: null as unknown,
    isUpdating: false,
    updateAvatar: vi.fn().mockResolvedValue(undefined),
    removeAvatar: vi.fn().mockResolvedValue(undefined),
  },
}));

// --- Module mocks ---------------------------------------------------------

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/queries/useUserProfileQuery', () => ({
  useUserProfileQuery: () => ({
    data: userProfile,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useProfileData: () => ({
    user: userProfile,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/hooks/mutations/useUpdateTimezoneMutation', () => ({
  useUpdateTimezoneMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/useAvatar', () => ({
  useAvatar: () => avatarState,
}));

vi.mock('@/lib/pocketbase', () => ({
  resolveFileUrl: vi.fn((_record, _filename) => undefined),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
  notifySuccess: notifyMock,
  notifyWarning: notifyMock,
  notifyError: notifyMock,
  notifyInfo: notifyMock,
}));

// --- Setup / teardown -----------------------------------------------------

beforeEach(() => {
  guard.reset();
  notifyMock.mockReset();
  authState.user = { ...defaultUser };
  authState.isAuthenticated = true;
  authState.initialCheckComplete = true;
  authState.isLoading = false;
});

afterEach(() => {
  guard.restore();
});

// --- Tests ----------------------------------------------------------------

describe('Profile route mount (real tabs + child sections)', () => {
  it('mounts the profile page with real Radix Tabs primitives', async () => {
    const { default: Profile } = await import('../Profile');

    renderWithProviders(<Profile />);

    // The page heading proves we got past auth + profile-query guards and
    // past the Radix Tabs mount.
    expect(await screen.findByRole('heading', { name: /profile & settings/i })).toBeInTheDocument();

    // Profile is split into Account / Preferences / Data / Support.
    expect(screen.getByRole('tab', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Support' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Company List' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Artist List' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Tag List' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reference lists' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Options' })).not.toBeInTheDocument();

    await new Promise(resolve => setTimeout(resolve, 50));

    assertNoRenderLoop(guard);
  });

  it('does not render an error-boundary fallback on mount', async () => {
    const { default: Profile } = await import('../Profile');

    renderWithProviders(<Profile />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /profile & settings/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.headline)).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.bodyText)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ERROR_BOUNDARY_FALLBACK_PATTERNS.retryButton })
    ).not.toBeInTheDocument();
  });

  it('redirects to login when auth has settled without a user', async () => {
    authState.user = null;
    authState.isAuthenticated = false;

    const { default: Profile } = await import('../Profile');

    const LoginDestination = () => {
      const location = useLocation();
      return (
        <div>
          Login destination
          <pre data-testid="location-state">{JSON.stringify(location.state ?? null)}</pre>
        </div>
      );
    };

    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<LoginDestination />} />
      </Routes>,
      { initialRoute: '/profile' }
    );

    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /profile & settings/i })).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
      from: expect.objectContaining({ pathname: '/profile' }),
    });
  });
});
