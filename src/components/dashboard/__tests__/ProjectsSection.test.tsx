import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../../test-utils';
import ProjectsSection from '../ProjectsSection';

const mockUpdateStatus = vi.fn();
const mockUseDashboardStatusCounts = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => ({
    filters: {
      activeStatus: 'everything',
      searchTerm: 'winter',
      searchAllFields: false,
      selectedTags: ['tag-a', 'tag-b'],
      selectedCompany: 'company-1',
      selectedArtist: 'all',
      selectedDrillShape: 'all',
      selectedYearFinished: 'all',
      includeMiniKits: true,
      includeDestashed: false,
      includeArchived: false,
      sortField: 'last_updated',
      sortDirection: 'desc',
    },
    activeFilterCount: 3,
  }),
  useFilterHelpers: () => ({
    updateStatus: mockUpdateStatus,
    clearActiveFilters: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useDashboardStatusCounts', () => ({
  useDashboardStatusCounts: (...args: unknown[]) => mockUseDashboardStatusCounts(...args),
}));

vi.mock('@/hooks/useDashboardPerformance', () => ({
  useDashboardPerformance: vi.fn(),
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('../DashboardStatusSegments', () => ({
  default: ({
    activeStatus,
    displayedCounts,
    onStatusChange,
  }: {
    activeStatus: string;
    displayedCounts: { everything: number };
    onStatusChange: (status: string) => void;
  }) => (
    <button data-testid="status-segments" onClick={() => onStatusChange('completed')}>
      {activeStatus}:{displayedCounts.everything}
    </button>
  ),
}));

vi.mock('../ProjectsGrid', () => ({
  default: () => <div data-testid="projects-grid">grid</div>,
}));

describe('ProjectsSection', () => {
  const dashboardData = {
    projects: [],
    totalItems: 0,
    totalPages: 0,
    isLoadingProjects: false,
    isFetchingProjects: false,
    errorProjects: null,
    refetchProjects: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseDashboardStatusCounts.mockReturnValue({
      displayedCounts: {
        everything: 18,
      },
      isLoading: false,
      error: null,
    });
  });

  it('renders status chips above the projects grid', () => {
    renderWithProviders(<ProjectsSection dashboardData={dashboardData} />);

    const statusSegments = screen.getByTestId('status-segments');
    const projectsGrid = screen.getByTestId('projects-grid');

    expect(statusSegments).toBeInTheDocument();
    expect(projectsGrid).toBeInTheDocument();
    expect(
      statusSegments.compareDocumentPosition(projectsGrid) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('wires status chip changes to FilterContext', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ProjectsSection dashboardData={dashboardData} />);

    await user.click(screen.getByTestId('status-segments'));

    expect(mockUpdateStatus).toHaveBeenCalledWith('completed');
  });
});
