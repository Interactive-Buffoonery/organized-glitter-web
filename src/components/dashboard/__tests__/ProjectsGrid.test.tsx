import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockProject, renderWithProviders } from '../../../test-utils';
import ProjectsGrid from '../ProjectsGrid';

const mockUseFilters = vi.fn();
const mockUseFilterHelpers = vi.fn();
const mockUseSortDividers = vi.fn();
const mockUseUndatedProjectCount = vi.fn();
const mockNavigateToProject = vi.fn();
const mockCapture = vi.fn();
const mockUseDashboardEmptyState = vi.fn();
const mockLibraryPagination = vi.hoisted(() => vi.fn());

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => mockUseFilters(),
  useFilterHelpers: () => mockUseFilterHelpers(),
}));

vi.mock('@/hooks/useSortDividers', () => ({
  useSortDividers: (...args: unknown[]) => mockUseSortDividers(...args),
}));

vi.mock('@/hooks/queries/useUndatedProjectCount', () => ({
  useUndatedProjectCount: (...args: unknown[]) => mockUseUndatedProjectCount(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/hooks/useNavigateToProject', () => ({
  useNavigateToProject: () => mockNavigateToProject,
}));

vi.mock('@/contexts/RecentlyEditedContext', () => ({
  useRecentlyEdited: () => ({ recentlyEditedProjectId: null }),
}));

vi.mock('@/hooks/useDashboardEmptyState', () => ({
  useDashboardEmptyState: () => mockUseDashboardEmptyState(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../ProjectGridCard', () => ({
  default: ({
    project,
    onNavigate,
  }: {
    project: { id: string; title: string };
    onNavigate: (projectId: string) => void;
  }) => (
    <button data-testid="grid-card" onClick={() => onNavigate(project.id)}>
      {project.title}
    </button>
  ),
}));

vi.mock('../ProjectListRow', () => ({
  default: ({ project }: { project: { title: string } }) => (
    <div data-testid="list-row">{project.title}</div>
  ),
}));

vi.mock('../ProjectsTable', () => ({
  default: ({ projects }: { projects: Array<{ title: string }> }) => (
    <div data-testid="projects-table">{projects.map(project => project.title).join(', ')}</div>
  ),
}));

vi.mock('@/components/ui/LibraryPagination', () => ({
  default: (props: Record<string, unknown>) => {
    mockLibraryPagination(props);
    return <div data-testid="pagination">Pagination</div>;
  },
}));

describe('ProjectsGrid view dispatch', () => {
  const project = createMockProject({ id: 'project-1', title: 'Table Test Project' });

  beforeEach(() => {
    mockLibraryPagination.mockReset();
    mockUseSortDividers.mockReturnValue({
      hasDividers: false,
      dividers: [],
    });

    mockUseUndatedProjectCount.mockReturnValue({
      count: null,
      isLoading: false,
      error: null,
    });

    mockUseFilterHelpers.mockReturnValue({
      clearActiveFilters: vi.fn(),
      updatePage: vi.fn(),
      updatePageSize: vi.fn(),
      updateSort: vi.fn(),
    });

    mockUseDashboardEmptyState.mockReturnValue({
      title: 'No matching projects',
      description: 'No projects found',
      isUnfiltered: false,
    });
  });

  it('renders grid cards in grid view', () => {
    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'grid',
        searchTerm: '',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [project],
          totalItems: 1,
          totalPages: 1,
          isLoadingProjects: false,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />,
      { initialRoute: '/dashboard' }
    );

    expect(screen.getByTestId('grid-card')).toHaveTextContent('Table Test Project');
    expect(screen.queryByTestId('list-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('projects-table')).not.toBeInTheDocument();
    const paginationProps = mockLibraryPagination.mock.lastCall?.[0] as {
      getPageHref: (page: number) => string;
    };
    expect(paginationProps.getPageHref(2)).toBe('/dashboard?page=2&pageSize=25');
  });

  it('preserves single-page disabling while forwarding background fetch state', () => {
    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'grid',
        searchTerm: '',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [project],
          totalItems: 1,
          totalPages: 1,
          isLoadingProjects: false,
          isFetchingProjects: true,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />
    );

    expect(mockLibraryPagination).toHaveBeenCalledWith(
      expect.objectContaining({ disabled: true, isLoading: true })
    );
  });

  it('renders list rows in list view', () => {
    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'list',
        searchTerm: '',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [project],
          totalItems: 1,
          totalPages: 1,
          isLoadingProjects: false,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />
    );

    expect(screen.getByTestId('list-row')).toHaveTextContent('Table Test Project');
    expect(screen.queryByTestId('grid-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('projects-table')).not.toBeInTheDocument();
  });

  it('renders the table branch in table view', () => {
    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'table',
        searchTerm: '',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [project],
          totalItems: 1,
          totalPages: 1,
          isLoadingProjects: false,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />
    );

    expect(screen.getByTestId('projects-table')).toHaveTextContent('Table Test Project');
    expect(screen.queryByTestId('grid-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-row')).not.toBeInTheDocument();
  });

  it('passes dashboard analytics metadata when opening a project', async () => {
    const user = userEvent.setup();

    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'grid',
        searchTerm: 'Winter',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'wishlist',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [project],
          totalItems: 1,
          totalPages: 1,
          isLoadingProjects: false,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />
    );

    await user.click(screen.getByTestId('grid-card'));

    expect(mockNavigateToProject).toHaveBeenCalledWith('project-1', {
      analytics: {
        fromSort: 'last_updated',
        fromStatus: 'wishlist',
        position: 1,
      },
      dashboardContext: {
        filters: {
          status: 'wishlist',
          company: 'all',
          artist: 'all',
          drillShape: 'all',
          yearFinished: 'all',
          includeMiniKits: true,
          includeDestashed: false,
          includeArchived: false,
          searchTerm: 'Winter',
          searchAllFields: undefined,
          selectedTags: [],
        },
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        preservationContext: {
          scrollPosition: 0,
          timestamp: expect.any(Number),
        },
      },
    });
  });

  it('renders a resettable filtered empty state', async () => {
    const user = userEvent.setup();
    const clearActiveFilters = vi.fn();

    mockUseFilterHelpers.mockReturnValue({
      clearActiveFilters,
      updatePage: vi.fn(),
      updatePageSize: vi.fn(),
      updateSort: vi.fn(),
    });

    mockUseDashboardEmptyState.mockReturnValue({
      title: 'No matching projects',
      description: 'No completed kits match square drills + full-size kits.',
      isUnfiltered: false,
    });

    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'grid',
        searchTerm: '',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'completed',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'square',
        selectedYearFinished: 'all',
        includeMiniKits: false,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [],
          totalItems: 0,
          totalPages: 0,
          isLoadingProjects: false,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />
    );

    expect(screen.getByRole('region', { name: 'Project results' })).toBeInTheDocument();
    expect(screen.getByText('No matching projects')).toBeInTheDocument();
    expect(
      screen.getByText('No completed kits match square drills + full-size kits.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(clearActiveFilters).toHaveBeenCalledTimes(1);
  });

  it('renders a dedicated unfiltered empty state with add project CTA', () => {
    mockUseDashboardEmptyState.mockReturnValue({
      title: 'No projects yet',
      description: 'Add your first project to start tracking your collection.',
      isUnfiltered: true,
    });

    mockUseFilters.mockReturnValue({
      filters: {
        viewType: 'grid',
        searchTerm: '',
        sortField: 'last_updated',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 25,
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
      },
    });

    renderWithProviders(
      <ProjectsGrid
        dashboardData={{
          projects: [],
          totalItems: 0,
          totalPages: 0,
          isLoadingProjects: false,
          errorProjects: null,
          refetchProjects: vi.fn(),
        }}
      />,
      { initialRoute: '/dashboard' }
    );

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add your first project to start tracking your collection.')
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Add New Project' })).toHaveAttribute(
      'href',
      '/projects/new'
    );
    expect(screen.queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument();
  });
});
