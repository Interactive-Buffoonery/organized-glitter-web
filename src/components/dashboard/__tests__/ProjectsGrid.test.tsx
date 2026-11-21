import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectType } from '@/types/project';
import { getDefaultFilters } from '@/contexts/FilterContext/types';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import ProjectsGrid from '../ProjectsGrid';

const filters = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/useNavigateToProject', () => ({ useNavigateToProject: () => vi.fn() }));
vi.mock('@/contexts/RecentlyEditedContext', () => ({
  useRecentlyEdited: () => ({ recentlyEditedProjectId: null }),
}));
vi.mock('@/hooks/queries/useUndatedProjectCount', () => ({
  useUndatedProjectCount: () => ({ count: 0 }),
}));
vi.mock('@/hooks/useDashboardEmptyState', () => ({ useDashboardEmptyState: () => ({}) }));
vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => ({ filters: filters.current }),
  useFilterHelpers: () => ({
    clearActiveFilters: vi.fn(),
    updatePage: vi.fn(),
    updatePageSize: vi.fn(),
    updateSort: vi.fn(),
  }),
}));

const wishlistKit = {
  id: 'kit',
  title: 'Wishlist kit',
  status: 'wishlist',
  createdAt: '2026-11-21',
  datePurchased: '2025-10-26',
} as ProjectType;

const renderGrid = (
  viewType: 'table' | 'list',
  sortField: DashboardValidSortField,
  isPlaceholderProjects = false
) => {
  filters.current = { ...getDefaultFilters(), viewType, sortField };
  return render(
    <MemoryRouter>
      <ProjectsGrid
        dashboardData={{
          projects: [wishlistKit],
          totalItems: 1,
          totalPages: 1,
          isLoadingProjects: false,
          isFetchingProjects: isPlaceholderProjects,
          isPlaceholderProjects,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />
    </MemoryRouter>
  );
};

const lifecycleTexts = () => [
  within(screen.getByRole('table')).getByText(/^(Added|Purchased)$/).parentElement?.textContent,
  screen.getAllByRole('button', { name: 'Open project Wishlist kit' })[0].textContent,
];

describe('ProjectsGrid lifecycle labels', () => {
  it('switches the table, mobile cards and list to the purchase date with the sort', () => {
    const { unmount } = renderGrid('table', 'last_updated');
    expect(lifecycleTexts().join(' | ')).not.toMatch(/Purchased/);
    unmount();

    renderGrid('table', 'date_purchased');
    const [tableCell, card] = lifecycleTexts();
    expect(tableCell).toBe('Purchased10/26/2025');
    expect(card).toContain('Purchased 10/26/2025');
    screen.getAllByRole('button', { name: 'Open project Wishlist kit' }).forEach(button => {
      if (button.textContent?.includes('Purchased'))
        expect(button).toHaveAccessibleDescription(/Purchased 10\/26\/2025/);
    });
  });

  it('shows the purchase date in list rows under purchase sort', () => {
    renderGrid('list', 'date_purchased');
    expect(screen.getByRole('link', { name: /Purchased 10\/26\/2025/ })).toBeInTheDocument();
  });

  it('keeps labels for the sort that produced placeholder rows', () => {
    const { rerender } = renderGrid('table', 'last_updated');
    filters.current = { ...filters.current, sortField: 'date_purchased' };
    rerender(
      <MemoryRouter>
        <ProjectsGrid
          dashboardData={{
            projects: [wishlistKit],
            totalItems: 1,
            totalPages: 1,
            isLoadingProjects: false,
            isFetchingProjects: true,
            isPlaceholderProjects: true,
            errorProjects: null,
            refetchProjects: vi.fn(),
          }}
        />
      </MemoryRouter>
    );

    expect(lifecycleTexts().join(' | ')).not.toMatch(/Purchased/);
  });
});
