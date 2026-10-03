import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test-utils';
import DashboardFilters from '../DashboardFilters';

const mockUseFilters = vi.fn();
const mockUseIsMobile = vi.fn();
const mockResetFilters = vi.fn();
const mockResetDashboardFilterPanel = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
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
    resetFilters: mockResetFilters,
    resetDashboardFilterPanel: mockResetDashboardFilterPanel,
  }),
}));

vi.mock('@/hooks/queries/useAvailableYears', () => ({
  useAvailableYears: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

describe('DashboardFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
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
  });

  it('does not show a badge for header-owned search state', () => {
    renderWithProviders(<DashboardFilters />);

    expect(screen.queryByText('2 Active')).not.toBeInTheDocument();
  });

  it('uses the panel-scoped reset helper instead of clearing global search state', () => {
    renderWithProviders(<DashboardFilters />);

    fireEvent.click(screen.getByTestId('reset-filters-button'));

    expect(mockResetDashboardFilterPanel).toHaveBeenCalledTimes(1);
    expect(mockResetFilters).not.toHaveBeenCalled();
  });

  it('labels the badge with selected tags when tags are the only active panel filter', () => {
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

    renderWithProviders(<DashboardFilters />);

    expect(screen.getByText('2 Tags')).toBeInTheDocument();
    expect(screen.queryByText('2 Active')).not.toBeInTheDocument();
  });

  it('shows both tag and non-tag counts when tags and other filters are active', () => {
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

    renderWithProviders(<DashboardFilters />);

    expect(screen.getByText('2 Tags • 1 Active')).toBeInTheDocument();
  });
});
