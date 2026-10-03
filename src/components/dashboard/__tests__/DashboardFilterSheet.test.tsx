import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test-utils';
import DashboardFilterSheet from '../DashboardFilterSheet';

const mockUseFilters = vi.fn();
const mockCapture = vi.fn();
const mockUseIsMobile = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => mockUseFilters(),
  useFilterHelpers: () => ({
    updateCompany: vi.fn(),
    updateArtist: vi.fn(),
    updateDrillShape: vi.fn(),
    updateYearFinished: vi.fn(),
    updateTags: vi.fn(),
    updateViewType: vi.fn(),
    resetFilters: vi.fn(),
    resetDashboardFilterPanel: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/queries/useAvailableYears', () => ({
  useAvailableYears: () => ({ data: [] }),
}));

const renderSheet = (props?: Partial<{ totalItems: number; isLoadingProjects: boolean }>) =>
  renderWithProviders(
    <DashboardFilterSheet
      totalItems={props?.totalItems ?? 0}
      isLoadingProjects={props?.isLoadingProjects ?? false}
    />
  );

describe('DashboardFilterSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFilters.mockReturnValue({
      filters: {
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
        viewType: 'grid',
        searchTerm: '',
        searchAllFields: false,
      },
      companies: [],
      artists: [],
      tags: [],
      activeFilterCount: 0,
      setFilters: vi.fn(),
    });
  });

  it('does not display the mobile filter trigger on desktop viewports', () => {
    mockUseIsMobile.mockReturnValue(false);
    const { container } = renderSheet();
    expect(container.firstChild).toBeNull();
  });

  it('renders a filters trigger button on mobile with no badge when no filters are active', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderSheet();
    const trigger = screen.getByRole('button', { name: /open filters/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAccessibleName('Open filters');
  });

  it('shows the panel-owned filter count as a badge and in the aria-label', () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseFilters.mockReturnValue({
      filters: {
        activeStatus: 'wishlist',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: true,
        includeArchived: false,
        selectedTags: [],
        viewType: 'grid',
        searchTerm: '',
        searchAllFields: false,
      },
      companies: [],
      artists: [],
      tags: [],
      activeFilterCount: 2,
      setFilters: vi.fn(),
    });
    renderSheet();
    const trigger = screen.getByRole('button', { name: /open filters\. 2 filters active/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('2');
  });

  it('fires DASHBOARD_FILTER_DRAWER_OPENED analytics with surface:mobile when opened', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderSheet();
    const trigger = screen.getByRole('button', { name: /open filters/i });
    fireEvent.click(trigger);
    expect(mockCapture).toHaveBeenCalledWith('dashboard_filter_drawer_opened', {
      surface: 'mobile',
    });
  });

  it('does not count header-owned search state in the trigger badge', () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseFilters.mockReturnValue({
      filters: {
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
        viewType: 'grid',
        searchTerm: 'Winter',
        searchAllFields: true,
      },
      companies: [],
      artists: [],
      tags: [],
      activeFilterCount: 2,
      setFilters: vi.fn(),
    });
    renderSheet();
    const trigger = screen.getByRole('button', { name: 'Open filters' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).not.toHaveTextContent('2');
  });

  it('uses singular label for a single active panel filter', () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseFilters.mockReturnValue({
      filters: {
        activeStatus: 'wishlist',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
        viewType: 'grid',
        searchTerm: '',
        searchAllFields: false,
      },
      companies: [],
      artists: [],
      tags: [],
      activeFilterCount: 1,
      setFilters: vi.fn(),
    });
    renderSheet();
    const trigger = screen.getByRole('button', { name: /open filters\. 1 filter active/i });
    expect(trigger).toBeInTheDocument();
  });

  it('uses tag-specific copy when selected tags are the only active panel filters', () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseFilters.mockReturnValue({
      filters: {
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: ['tag-a', 'tag-b'],
        viewType: 'grid',
        searchTerm: '',
        searchAllFields: false,
      },
      companies: [],
      artists: [],
      tags: [],
      activeFilterCount: 2,
      setFilters: vi.fn(),
    });

    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /open filters\. 2 tags selected/i }));

    expect(screen.getByText('2 tags selected')).toBeInTheDocument();
  });

  it('shows both tag and filter counts when tags and other filters are active', () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseFilters.mockReturnValue({
      filters: {
        activeStatus: 'everything',
        selectedCompany: 'company-1',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: ['tag-a', 'tag-b'],
        viewType: 'grid',
        searchTerm: '',
        searchAllFields: false,
      },
      companies: [],
      artists: [],
      tags: [],
      activeFilterCount: 3,
      setFilters: vi.fn(),
    });

    renderSheet();
    fireEvent.click(
      screen.getByRole('button', { name: /open filters\. 2 tags selected • 1 filter active/i })
    );

    expect(screen.getByText('2 tags selected • 1 filter active')).toBeInTheDocument();
  });

  it('hides the View section inside the sheet because it lives on the mobile canvas', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /open filters/i }));
    expect(screen.queryByText('View')).not.toBeInTheDocument();
  });
});
