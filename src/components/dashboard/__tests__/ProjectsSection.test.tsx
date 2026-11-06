import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectsSection from '../ProjectsSection';
import { getDefaultFilters } from '@/contexts/FilterContext/types';

const filterActions = vi.hoisted(() => ({
  updateStatus: vi.fn(),
  clearActiveFilters: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/queries/useDashboardStatusCounts', () => ({
  useDashboardStatusCounts: () => ({ displayedCounts: {}, isLoading: false }),
}));
vi.mock('@/hooks/useDashboardPerformance', () => ({ useDashboardPerformance: () => {} }));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: () => {} }));
vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => ({
    filters: { ...getDefaultFilters(), activeStatus: 'progress' },
    activeFilterCount: 1,
  }),
  useFilterHelpers: () => filterActions,
}));
vi.mock('../DashboardStatusSegments', () => ({
  default: ({ onStatusChange }: { onStatusChange: (status: string) => void }) => (
    <button type="button" onClick={() => onStatusChange('everything')}>
      All
    </button>
  ),
}));
vi.mock('../ProjectsGrid', () => ({ default: () => <div>No projects yet</div> }));

const data = {
  projects: [],
  totalItems: 0,
  totalItemsIsEstimate: false,
  totalPages: 0,
  isLoadingProjects: false,
  isFetchingProjects: false,
  errorProjects: new Error('private backend failure'),
  refetchProjects: vi.fn(),
};

describe('Library load failure', () => {
  it('keeps status and clear-filter actions available when a filtered query fails', async () => {
    render(<ProjectsSection dashboardData={data} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(filterActions.clearActiveFilters).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(filterActions.updateStatus).toHaveBeenCalledWith('everything');
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
    expect(screen.queryByText('0 projects')).not.toBeInTheDocument();
  });

  it('offers retry without claiming an empty library or exposing errors', async () => {
    render(<ProjectsSection dashboardData={data} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your projects');
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
    expect(screen.queryByText('0 projects')).not.toBeInTheDocument();
    expect(screen.queryByText('private backend failure')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(data.refetchProjects).toHaveBeenCalledOnce();
  });
});
