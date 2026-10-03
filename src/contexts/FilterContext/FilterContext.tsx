/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useReducer } from 'react';
import { useMetadata } from '@/contexts/MetadataContext';
import { useMobileDevice } from '@/hooks/use-mobile';
import {
  DashboardViewType,
  FilterState,
  getActiveFilterResetPatch,
  getDashboardFilterPanelResetPatch,
  getDefaultFilters,
} from './types';
import { ProjectFilterStatus } from '@/types/project';
import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { FilterStateProvider, useFilterState } from './FilterStateContext';
import { useFilterAutoSave } from './useFilterAutoSave';
import { useFilterUrlSync } from './useFilterUrlSync';
import { useFilterViewTypePersistence } from './useFilterViewTypePersistence';

interface FilterContextType {
  filters: FilterState;
  setFilters: (
    updates: Partial<FilterState> | ((current: FilterState) => Partial<FilterState>)
  ) => void;
  companies: Array<{ id: string; name: string }>;
  artists: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  isLoading: boolean;
  activeFilterCount: number;
  setPage: (page: number, options?: { replace?: boolean }) => void;
  setPageSize: (pageSize: number) => void;
  searchDraftResetVersion: number;
  resetSearchDraft: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

interface FilterProviderProps {
  children: React.ReactNode;
  user: { id: string; email?: string } | null;
  /**
   * Partial filter overrides applied to the initial filter state. Two callers
   * compose into this single prop in Dashboard.tsx:
   *   1. `getInitialFiltersFromNavigationContext`: full saved snapshot from
   *      React Router state or the persisted PocketBase record (sort, page
   *      size, view, panel filters).
   *   2. `getInitialFiltersFromUrl`: shareable result filters, sort, and
   *      pagination. URL params win over the saved snapshot so deep links
   *      remain authoritative.
   * Validation lives in each helper so this prop can stay loosely typed.
   */
  initialFilters?: Partial<FilterState>;
}

const FilterProviderContent: React.FC<{
  children: React.ReactNode;
  user: FilterProviderProps['user'];
}> = ({ children, user }) => {
  const metadata = useMetadata();
  const { filters, setFilters, activeFilterCount } = useFilterState();
  const [searchDraftResetVersion, resetSearchDraft] = useReducer(version => version + 1, 0);

  const { setPage, setPageSize } = useFilterUrlSync();
  useFilterViewTypePersistence();
  useFilterAutoSave({ userId: user?.id });

  const isLoading = Boolean(
    metadata?.isLoading?.companies || metadata?.isLoading?.artists || metadata?.isLoading?.tags
  );

  const memoizedCompanies = useMemo(() => metadata?.companies || [], [metadata?.companies]);
  const memoizedArtists = useMemo(() => metadata?.artists || [], [metadata?.artists]);
  const memoizedTags = useMemo(() => metadata?.tags || [], [metadata?.tags]);

  const contextValue: FilterContextType = useMemo(
    () => ({
      filters,
      setFilters,
      companies: memoizedCompanies,
      artists: memoizedArtists,
      tags: memoizedTags,
      isLoading,
      activeFilterCount,
      setPage,
      setPageSize,
      searchDraftResetVersion,
      resetSearchDraft,
    }),
    [
      filters,
      setFilters,
      memoizedCompanies,
      memoizedArtists,
      memoizedTags,
      isLoading,
      activeFilterCount,
      setPage,
      setPageSize,
      searchDraftResetVersion,
      resetSearchDraft,
    ]
  );

  return <FilterContext.Provider value={contextValue}>{children}</FilterContext.Provider>;
};

export const FilterProvider: React.FC<FilterProviderProps> = ({
  children,
  user,
  initialFilters,
}) => {
  const { isMobile, isTablet } = useMobileDevice();
  const isMobilePhone = isMobile && !isTablet;

  return (
    <FilterStateProvider initialFilters={initialFilters} isMobilePhone={isMobilePhone}>
      <FilterProviderContent user={user}>{children}</FilterProviderContent>
    </FilterStateProvider>
  );
};

export const useFilters = () => {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
};

export const useFilterHelpers = () => {
  const { setFilters, setPage, setPageSize, resetSearchDraft } = useFilters();

  return useMemo(
    () => ({
      updateStatus: (status: ProjectFilterStatus) => setFilters({ activeStatus: status }),
      updateCompany: (company: string) => setFilters({ selectedCompany: company }),
      updateArtist: (artist: string) => setFilters({ selectedArtist: artist }),
      updateDrillShape: (shape: string) => setFilters({ selectedDrillShape: shape }),
      updateYearFinished: (year: string) => setFilters({ selectedYearFinished: year }),
      updateSearch: (searchTerm: string) => setFilters({ searchTerm }),
      updateTags: (selectedTags: string[]) =>
        setFilters({ selectedTags: Array.from(new Set(selectedTags.filter(Boolean))) }),
      updateSearchAllFields: (searchAllFields: boolean) => setFilters({ searchAllFields }),
      updateSort: (sortField: DashboardValidSortField, sortDirection: 'asc' | 'desc') =>
        setFilters({ sortField, sortDirection }),
      updatePage: (currentPage: number, options?: { replace?: boolean }) =>
        setPage(currentPage, options),
      updatePageSize: (pageSize: number) => setPageSize(pageSize),
      updateViewType: (viewType: DashboardViewType) => setFilters({ viewType }),
      resetFilters: () => {
        setFilters(getDefaultFilters());
        resetSearchDraft();
      },
      clearActiveFilters: () => {
        setFilters(getActiveFilterResetPatch());
        resetSearchDraft();
      },
      resetDashboardFilterPanel: () => setFilters(getDashboardFilterPanelResetPatch()),
    }),
    [setFilters, setPage, setPageSize, resetSearchDraft]
  );
};
