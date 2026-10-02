import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils';

const {
  useAppReadyMock,
  authState,
  enabledVerticalsState,
  savedNavigationState,
  initialFiltersSpy,
} = vi.hoisted(() => ({
  useAppReadyMock: vi.fn(),
  authState: {
    user: { id: 'user-123' } as { id: string } | null,
  },
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: true,
  },
  savedNavigationState: {
    data: undefined as { currentPage: number; pageSize: number } | undefined,
    isLoading: false,
  },
  initialFiltersSpy: vi.fn(),
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: (...args: unknown[]) => useAppReadyMock(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/components/dashboard/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

vi.mock('@/components/coloring/ColoringDashboardPane', () => ({
  ColoringDashboardPane: () => <div>Coloring pane</div>,
}));

vi.mock('@/components/dashboard/ProjectsSection', () => ({
  default: () => <div>Projects section</div>,
}));

vi.mock('@/components/dashboard/DashboardFilters', () => ({
  default: () => null,
}));

vi.mock('@/components/dashboard/DashboardHeader', () => ({
  default: () => null,
}));

vi.mock('@/contexts/ColoringFilterContext', () => ({
  ColoringFilterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getInitialColoringFiltersFromUrl: () => ({}),
}));

vi.mock('@/contexts/FilterContext', () => ({
  FilterProvider: ({
    children,
    initialFilters,
  }: {
    children: React.ReactNode;
    initialFilters?: unknown;
  }) => {
    initialFiltersSpy(initialFilters);
    return <>{children}</>;
  },
  useFilters: () => ({ filters: {} }),
  useFilterHelpers: () => ({ updatePage: vi.fn() }),
}));

vi.mock('@/contexts/RecentlyEditedContext', () => ({
  RecentlyEditedProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRecentlyEdited: () => ({ setRecentlyEditedProjectId: vi.fn() }),
}));

vi.mock('@/hooks/queries/useDashboardNavigationContext', () => ({
  useDashboardNavigationContext: () => savedNavigationState,
}));

vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    projects: [],
    totalItems: 0,
    totalItemsIsEstimate: false,
    totalPages: 0,
    isLoadingProjects: false,
    isFetchingProjects: false,
    errorProjects: null,
    refetchProjects: vi.fn(),
  }),
}));

import Dashboard from '../Dashboard';

describe('Dashboard page readiness', () => {
  beforeEach(() => {
    useAppReadyMock.mockReset();
    authState.user = { id: 'user-123' };
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = true;
    savedNavigationState.data = undefined;
    savedNavigationState.isLoading = false;
    initialFiltersSpy.mockReset();
  });

  it('signals app ready on mount while verticals are still loading', () => {
    renderWithProviders(<Dashboard />, { initialRoute: '/dashboard' });

    expect(useAppReadyMock).toHaveBeenCalled();
    expect(useAppReadyMock.mock.calls.every(call => call.length === 0)).toBe(true);
    expect(screen.getByTestId('dashboard-shell')).toBeInTheDocument();
  });

  it('restores the saved dashboard page on a cold mount', () => {
    savedNavigationState.data = { currentPage: 4, pageSize: 50 };

    renderWithProviders(<Dashboard />, { initialRoute: '/dashboard' });

    expect(initialFiltersSpy).toHaveBeenCalledWith(
      expect.objectContaining({ currentPage: 4, pageSize: 50 })
    );
  });
});
