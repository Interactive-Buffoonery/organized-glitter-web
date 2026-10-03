import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { useFilterState } from './FilterStateContext';
import type { FilterState } from './types';
import {
  getDiamondPaginationFromUrl,
  getDiamondUrlStateFromUrl,
  setDiamondDashboardParams,
  setDiamondPaginationParams,
} from './urlHydration';

export const useFilterUrlSync = () => {
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const lastLocationKeyRef = useRef(location.key);
  const lastSyncedFiltersRef = useRef<FilterState | null>(null);
  const { filters, setFilters } = useFilterState();

  useEffect(() => {
    if (lastLocationKeyRef.current === location.key) return;
    lastLocationKeyRef.current = location.key;

    const params = new URLSearchParams(location.search);
    // Our own page changes and canonical writebacks already match filter state.
    // Hydrate only when navigation brings a different result snapshot.
    if (setDiamondDashboardParams(params, filters).toString() === params.toString()) return;
    setFilters(getDiamondUrlStateFromUrl(params));
  }, [filters, location.key, location.search, setFilters]);

  const setPage = useCallback(
    (page: number, options?: { replace?: boolean }) => {
      const next = setDiamondPaginationParams(new URLSearchParams(), page, filters.pageSize);
      const { currentPage: normalizedPage } = getDiamondPaginationFromUrl(next);
      if (normalizedPage === filters.currentPage) return;
      setFilters({ currentPage: normalizedPage });
      setSearchParams(
        current =>
          setDiamondDashboardParams(current, {
            ...filters,
            currentPage: normalizedPage,
          }),
        { replace: options?.replace ?? false }
      );
    },
    [filters, setFilters, setSearchParams]
  );

  const setPageSize = useCallback(
    (size: number) => {
      const next = setDiamondPaginationParams(new URLSearchParams(), 1, size);
      const { pageSize: normalizedSize } = getDiamondPaginationFromUrl(next);
      setFilters({ currentPage: 1, pageSize: normalizedSize });
      setSearchParams(
        current =>
          setDiamondDashboardParams(current, {
            ...filters,
            currentPage: 1,
            pageSize: normalizedSize,
          }),
        {
          replace: false,
        }
      );
    },
    [filters, setFilters, setSearchParams]
  );

  useEffect(() => {
    // A navigation can change setSearchParams before URL hydration updates filters.
    // Only filter changes should write the current state back to the URL.
    if (lastSyncedFiltersRef.current === filters) return;
    lastSyncedFiltersRef.current = filters;

    const current = new URLSearchParams(location.search);
    const next = setDiamondDashboardParams(current, filters);
    if (next.toString() !== current.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, location.search, setSearchParams]);

  return { setPage, setPageSize };
};
