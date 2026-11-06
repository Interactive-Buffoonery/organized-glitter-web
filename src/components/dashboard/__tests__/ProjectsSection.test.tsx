import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectsSection from '../ProjectsSection';
import { getDefaultFilters } from '@/contexts/FilterContext/types';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/queries/useDashboardStatusCounts', () => ({
  useDashboardStatusCounts: () => ({ displayedCounts: {}, isLoading: false }),
}));
vi.mock('@/hooks/useDashboardPerformance', () => ({ useDashboardPerformance: () => {} }));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: () => {} }));
vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => ({ filters: getDefaultFilters(), activeFilterCount: 0 }),
  useFilterHelpers: () => ({ updateStatus: vi.fn(), clearActiveFilters: vi.fn() }),
}));
vi.mock('../DashboardStatusSegments', () => ({ default: () => <div>Status filters</div> }));
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
