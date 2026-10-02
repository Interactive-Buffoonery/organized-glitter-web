import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test-utils';
import DashboardHeader from '../DashboardHeader';

const mockUseFilters = vi.fn();
const mockUseFilterHelpers = vi.fn();
const mockCapture = vi.fn();
const mockSetFilters = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

vi.mock('@/contexts/FilterContext', () => ({
  useFilters: () => mockUseFilters(),
  useFilterHelpers: () => mockUseFilterHelpers(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => ({ isTablet: false }),
  useIsMobile: () => false,
}));

const renderHeader = () =>
  renderWithProviders(
    <DashboardHeader isFetchingProjects={false} totalItems={0} isLoadingProjects={false} />
  );

describe('DashboardHeader', () => {
  const updateSearch = vi.fn();
  const updateViewType = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseFilters.mockReturnValue({
      filters: {
        searchTerm: 'Winter',
        searchAllFields: false,
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
        sortField: 'last_updated',
        sortDirection: 'desc',
        viewType: 'grid',
      },
      setFilters: mockSetFilters,
      resetSearchDraft: vi.fn(),
    });

    mockUseFilterHelpers.mockReturnValue({
      updateSearch,
      updateSearchAllFields: vi.fn(),
      updateSort: vi.fn(),
      updateViewType,
    });
  });

  it('renders the canonical filter-context search term in the input', () => {
    const { container } = renderHeader();

    expect(screen.getAllByDisplayValue('Winter')).toHaveLength(2);

    const searchInputs = container.querySelectorAll('input[type="text"]');
    expect(searchInputs).toHaveLength(2);
    expect(new Set(Array.from(searchInputs, input => input.id)).size).toBe(2);
  });

  it('updates FilterContext search after the local commit delay', async () => {
    vi.useFakeTimers();

    renderHeader();

    const searchInput = screen.getAllByLabelText(/search project titles/i)[0];

    fireEvent.change(searchInput, { target: { value: 'Moon' } });
    await vi.advanceTimersByTimeAsync(350);

    expect(updateSearch).toHaveBeenLastCalledWith('Moon');
    vi.useRealTimers();
  });

  it('captures committed search analytics without the raw search text', () => {
    const { rerender } = renderHeader();

    mockUseFilters.mockReturnValue({
      filters: {
        searchTerm: 'Moon',
        searchAllFields: false,
        activeStatus: 'wishlist',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
        sortField: 'last_updated',
        sortDirection: 'desc',
        viewType: 'grid',
      },
    });

    rerender(
      <DashboardHeader isFetchingProjects={false} totalItems={0} isLoadingProjects={false} />
    );

    expect(mockCapture).toHaveBeenCalledWith('dashboard_search_performed', {
      term_length: 4,
      had_filters: true,
    });
  });

  it('updates the mobile canvas view toggle from the header row', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(updateViewType).toHaveBeenCalledWith('list');
    expect(mockCapture).toHaveBeenCalledWith('dashboard_view_toggled', { to: 'list' });
  });

  it('renders quick views in the header and applies a preset atomically', async () => {
    const user = userEvent.setup();

    renderHeader();

    await user.click(screen.getAllByRole('button', { name: 'Quick views' }).at(-1)!);
    await user.click(screen.getByRole('menuitem', { name: 'Waiting to arrive' }));

    expect(mockSetFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        activeStatus: 'purchased',
        sortField: 'date_purchased',
        sortDirection: 'asc',
        selectedTags: [],
        searchTerm: '',
      })
    );
    expect(mockCapture).toHaveBeenCalledWith('dashboard_preset_chip_clicked', {
      preset: 'waiting-to-arrive',
    });
  });

  it('shows and applies Clear quick view when a quick view is active', async () => {
    const user = userEvent.setup();
    mockUseFilters.mockReturnValue({
      filters: {
        searchTerm: '',
        searchAllFields: false,
        activeStatus: 'purchased',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        includeMiniKits: true,
        includeDestashed: false,
        includeArchived: false,
        selectedTags: [],
        sortField: 'date_purchased',
        sortDirection: 'asc',
        viewType: 'grid',
      },
      setFilters: mockSetFilters,
      resetSearchDraft: vi.fn(),
    });

    renderHeader();

    await user.click(
      screen.getAllByRole('button', { name: 'Quick views: Waiting to arrive' }).at(-1)!
    );
    await user.click(screen.getByRole('menuitem', { name: 'Clear quick view' }));

    expect(mockSetFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        activeStatus: 'everything',
        selectedCompany: 'all',
        selectedArtist: 'all',
        selectedDrillShape: 'all',
        selectedYearFinished: 'all',
        selectedTags: [],
        searchTerm: '',
        searchAllFields: false,
        sortField: 'last_updated',
        sortDirection: 'desc',
      })
    );
  });
});
