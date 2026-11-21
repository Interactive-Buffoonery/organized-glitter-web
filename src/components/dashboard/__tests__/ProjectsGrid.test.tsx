import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectType } from '@/types/project';
import { getDefaultFilters } from '@/contexts/FilterContext/types';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import ProjectsGrid from '../ProjectsGrid';

const filters = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const undatedCount = vi.hoisted(() => ({ current: 0 }));

vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/useNavigateToProject', () => ({ useNavigateToProject: () => vi.fn() }));
vi.mock('@/contexts/RecentlyEditedContext', () => ({
  useRecentlyEdited: () => ({ recentlyEditedProjectId: null }),
}));
vi.mock('@/hooks/queries/useUndatedProjectCount', () => ({
  useUndatedProjectCount: () => ({ count: undatedCount.current }),
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

const grid = (isPlaceholderProjects: boolean, projects: ProjectType[] = [wishlistKit]) => (
  <MemoryRouter>
    <ProjectsGrid
      dashboardData={{
        projects,
        totalItems: projects.length,
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

const renderGrid = (
  viewType: 'table' | 'list',
  sortField: DashboardValidSortField,
  isPlaceholderProjects = false
) => {
  filters.current = { ...getDefaultFilters(), viewType, sortField };
  return render(grid(isPlaceholderProjects));
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
    rerender(grid(true));

    expect(lifecycleTexts().join(' | ')).not.toMatch(/Purchased/);
  });

  it('leaves out the server count for undated placeholder rows', () => {
    const unpurchasedKit = {
      ...wishlistKit,
      id: 'unpurchased',
      title: 'Unpurchased kit',
      datePurchased: undefined,
    };
    const projects = [wishlistKit, unpurchasedKit];
    filters.current = { ...getDefaultFilters(), viewType: 'list', sortField: 'date_purchased' };
    undatedCount.current = 5;
    const { rerender } = render(grid(false, projects));
    expect(screen.getByText(/Kits with no purchase date/).textContent).toContain('5 total');

    filters.current = { ...filters.current, sortField: 'date_received' };
    undatedCount.current = 9;
    rerender(grid(true, projects));

    const divider = screen.getByText(/Kits with no purchase date/).textContent;
    expect(divider).not.toMatch(/9|5 total/);
    expect(divider).toContain('1 on this page');
  });
});
