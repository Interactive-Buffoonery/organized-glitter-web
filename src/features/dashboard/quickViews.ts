import type { FilterState } from '@/contexts/FilterContext/types';

export interface DashboardQuickView {
  id: 'waiting-to-arrive' | 'ready-to-start' | 'in-progress' | 'finished-this-year';
  label: string;
  patch: Partial<FilterState>;
}

const QUICK_VIEW_RESET_PATCH: Partial<FilterState> = {
  activeStatus: 'everything',
  selectedCompany: 'all',
  selectedArtist: 'all',
  selectedDrillShape: 'all',
  selectedYearFinished: 'all',
  includeMiniKits: true,
  includeDestashed: false,
  includeArchived: false,
  searchTerm: '',
  searchAllFields: false,
  selectedTags: [],
  sortField: 'last_updated',
  sortDirection: 'desc',
};

export const DASHBOARD_QUICK_VIEWS: DashboardQuickView[] = [
  {
    id: 'waiting-to-arrive',
    label: 'Waiting to arrive',
    patch: {
      activeStatus: 'purchased',
      sortField: 'date_purchased',
      sortDirection: 'asc',
    },
  },
  {
    id: 'ready-to-start',
    label: 'Ready to start',
    patch: {
      activeStatus: 'kitted',
    },
  },
  {
    id: 'in-progress',
    label: 'In progress',
    patch: {
      activeStatus: 'progress',
      sortField: 'date_started',
      sortDirection: 'desc',
    },
  },
  {
    id: 'finished-this-year',
    label: 'Finished this year',
    patch: {
      activeStatus: 'completed',
      selectedYearFinished: new Date().getFullYear().toString(),
      sortField: 'date_finished',
      sortDirection: 'desc',
    },
  },
];

const filtersMatchPatch = (filters: FilterState, patch: Partial<FilterState>) => {
  return Object.entries(patch).every(([key, value]) => {
    const filterValue = filters[key as keyof FilterState];

    if (Array.isArray(value) && Array.isArray(filterValue)) {
      return (
        value.length === filterValue.length &&
        value.every((item, index) => item === filterValue[index])
      );
    }

    return filterValue === value;
  });
};

export const getDashboardQuickViewResetPatch = (): Partial<FilterState> => ({
  ...QUICK_VIEW_RESET_PATCH,
});

export const getDashboardQuickViewPatch = (
  quickView: DashboardQuickView
): Partial<FilterState> => ({
  ...getDashboardQuickViewResetPatch(),
  ...quickView.patch,
});

export const getActiveDashboardQuickView = (filters: FilterState): DashboardQuickView | null => {
  return (
    DASHBOARD_QUICK_VIEWS.find(quickView =>
      filtersMatchPatch(filters, getDashboardQuickViewPatch(quickView))
    ) || null
  );
};
