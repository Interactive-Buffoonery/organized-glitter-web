/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { normalizeProjectSearchTerm } from '@/features/dashboard/dashboard.constants';

import { FilterState, getActiveFilterCount, getDefaultFilters } from './types';

type FilterStateUpdate = Partial<FilterState> | ((current: FilterState) => Partial<FilterState>);

interface FilterStateContextType {
  filters: FilterState;
  setFilters: (updates: FilterStateUpdate) => void;
  activeFilterCount: number;
}

const FilterStateContext = createContext<FilterStateContextType | null>(null);

export const areFiltersEqual = (obj1: FilterState, obj2: FilterState): boolean => {
  if (obj1 === obj2) return true;

  const keys1 = Object.keys(obj1) as (keyof FilterState)[];
  const keys2 = Object.keys(obj2) as (keyof FilterState)[];

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    const val1 = obj1[key];
    const val2 = obj2[key];

    if (Array.isArray(val1) && Array.isArray(val2)) {
      if (val1.length !== val2.length) return false;
      if (!val1.every((item, index) => item === val2[index])) return false;
      continue;
    }

    if (val1 !== val2) return false;
  }

  return true;
};

interface FilterStateProviderProps {
  children: React.ReactNode;
  initialFilters?: Partial<FilterState>;
  isMobilePhone: boolean;
}

export const FilterStateProvider: React.FC<FilterStateProviderProps> = ({
  children,
  initialFilters,
  isMobilePhone,
}) => {
  const [filters, setFiltersState] = useState<FilterState>(() => ({
    ...getDefaultFilters(isMobilePhone),
    ...initialFilters,
    searchTerm: normalizeProjectSearchTerm(initialFilters?.searchTerm ?? ''),
  }));

  const setFilters = useCallback((updates: FilterStateUpdate) => {
    setFiltersState(currentFilters => {
      const updateObj = typeof updates === 'function' ? updates(currentFilters) : updates;
      const candidate = { ...currentFilters, ...updateObj };
      if (areFiltersEqual(candidate, currentFilters)) return currentFilters;

      const resultInputsChanged = !areFiltersEqual(
        {
          ...candidate,
          currentPage: currentFilters.currentPage,
          viewType: currentFilters.viewType,
        },
        currentFilters
      );
      const newFilters = {
        ...candidate,
        currentPage:
          'currentPage' in updateObj
            ? updateObj.currentPage!
            : resultInputsChanged
              ? 1
              : currentFilters.currentPage,
      };

      return areFiltersEqual(newFilters, currentFilters) ? currentFilters : newFilters;
    });
  }, []);

  const activeFilterCount = useMemo(() => getActiveFilterCount(filters), [filters]);

  const value = useMemo(
    () => ({
      filters,
      setFilters,
      activeFilterCount,
    }),
    [filters, setFilters, activeFilterCount]
  );

  return <FilterStateContext.Provider value={value}>{children}</FilterStateContext.Provider>;
};

export const useFilterState = () => {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error('useFilterState must be used within a FilterStateProvider');
  }
  return context;
};
