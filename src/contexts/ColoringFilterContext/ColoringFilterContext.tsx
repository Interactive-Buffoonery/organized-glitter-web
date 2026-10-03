/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useColoringTags } from '@/hooks/queries/coloring/useColoringTags';
import { useColoringNavigationContext } from '@/hooks/queries/useColoringNavigationContext';
import {
  type ColoringNavigationContext,
  useSaveColoringNavigationContext,
} from '@/hooks/mutations/useSaveColoringNavigationContext';
import { useMobileDevice } from '@/hooks/use-mobile';
import { createLogger } from '@/utils/logger';
import {
  COLORING_VIEW_TYPE_STORAGE_KEY,
  ColoringFilterState,
  ColoringSortDirection,
  ColoringSortField,
  ColoringViewType,
  getActiveColoringFilterCount,
  getActiveColoringFilterResetPatch,
  getDefaultColoringFilters,
  getDefaultColoringViewType,
  normalizeColoringPagination,
  normalizeColoringStatusFilters,
} from './types';
import {
  getInitialColoringFiltersFromUrl,
  setColoringPaginationParams,
  UrlHydratedColoringFilters,
} from './urlHydration';

const SAVE_DEBOUNCE_MS = 1000;

const logger = createLogger('ColoringFilterProvider');

interface ColoringPublisherOption {
  id: string;
  name: string;
}

interface ColoringFilterOption {
  id: string;
  name: string;
}

interface ColoringFilterContextType {
  filters: ColoringFilterState;
  markUserInteraction: () => void;
  setFilters: (
    updates:
      | Partial<ColoringFilterState>
      | ((current: ColoringFilterState) => Partial<ColoringFilterState>)
  ) => void;
  setCurrentPage: (page: number, options?: { replace?: boolean }) => void;
  setPageSize: (pageSize: number) => void;
  publishers: ColoringPublisherOption[];
  illustrators: ColoringFilterOption[];
  tags: ColoringFilterOption[];
  isLoading: boolean;
  activeFilterCount: number;
  isNavigationContextReady: boolean;
  viewType: ColoringViewType;
  setViewType: (viewType: ColoringViewType) => void;
}

const ColoringFilterContext = createContext<ColoringFilterContextType | null>(null);

const deepEqual = (a: ColoringFilterState, b: ColoringFilterState): boolean => {
  if (a === b) return true;
  if (a.mysteryOnly !== b.mysteryOnly) return false;
  if (a.includeArchived !== b.includeArchived) return false;
  if (a.includeDestashed !== b.includeDestashed) return false;
  if (a.searchTerm !== b.searchTerm) return false;
  if (a.sortField !== b.sortField) return false;
  if (a.sortDirection !== b.sortDirection) return false;
  if (a.currentPage !== b.currentPage) return false;
  if (a.pageSize !== b.pageSize) return false;
  const arrayFields: Array<keyof ColoringFilterState> = [
    'selectedStatuses',
    'selectedPublishers',
    'selectedIllustrators',
    'selectedTags',
  ];
  for (const field of arrayFields) {
    const left = a[field] as string[];
    const right = b[field] as string[];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
};

const queryInputsEqual = (a: ColoringFilterState, b: ColoringFilterState): boolean => {
  if (a.mysteryOnly !== b.mysteryOnly) return false;
  if (a.includeArchived !== b.includeArchived) return false;
  if (a.includeDestashed !== b.includeDestashed) return false;
  if (a.searchTerm.trim() !== b.searchTerm.trim()) return false;
  if (a.sortField !== b.sortField) return false;
  if (a.sortDirection !== b.sortDirection) return false;
  if (a.pageSize !== b.pageSize) return false;

  const arrayFields: Array<keyof ColoringFilterState> = [
    'selectedStatuses',
    'selectedPublishers',
    'selectedIllustrators',
    'selectedTags',
  ];
  return arrayFields.every(field => {
    const left = a[field] as string[];
    const right = b[field] as string[];
    return left.length === right.length && left.every((value, index) => value === right[index]);
  });
};

interface ColoringFilterProviderProps {
  children: React.ReactNode;
  user: { id: string; email?: string } | null;
  initialFilters?: UrlHydratedColoringFilters;
}

export const ColoringFilterProvider: React.FC<ColoringFilterProviderProps> = ({
  children,
  user,
  initialFilters,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFiltersRef = useRef(
    initialFilters ?? getInitialColoringFiltersFromUrl(searchParams)
  );
  const resolvedInitialFilters = initialFiltersRef.current;
  const { isMobile, isTablet } = useMobileDevice();
  const isMobilePhone = isMobile && !isTablet;
  const publishersQuery = useBookPublishers(user?.id);
  const illustratorsQuery = useBookIllustrators(user?.id);
  const tagsQuery = useColoringTags();
  const savedContextQuery = useColoringNavigationContext(user?.id);
  const saveContext = useSaveColoringNavigationContext(user?.id ?? '');
  const pendingSaveRef = useRef<{
    userId: string;
    navigationContext: ColoringNavigationContext;
  } | null>(null);
  const hasObservedInitialUrlRef = useRef(false);
  const lastWrittenSearchRef = useRef<string | null>(null);
  const saveContextMutateRef = useRef(saveContext.mutate);
  useEffect(() => {
    saveContextMutateRef.current = saveContext.mutate;
  }, [saveContext.mutate]);

  // Track whether URL hydration provided any filters. URL wins over saved
  // nav-context: a bookmarked or shared link is explicit intent and should
  // override stored preferences.
  const urlProvidedInitial = Object.keys(resolvedInitialFilters).length > 0;
  const [isNavigationContextReady, setIsNavigationContextReady] = useState(
    urlProvidedInitial || !user?.id
  );

  const [filters, setFiltersState] = useState<ColoringFilterState>(() =>
    normalizeColoringStatusFilters({
      ...getDefaultColoringFilters(),
      ...resolvedInitialFilters,
    })
  );
  const [viewType, setViewTypeState] = useState<ColoringViewType>(() =>
    getDefaultColoringViewType(isMobilePhone)
  );

  const setViewType = useCallback((nextViewType: ColoringViewType) => {
    setViewTypeState(current => (current === nextViewType ? current : nextViewType));
  }, []);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(COLORING_VIEW_TYPE_STORAGE_KEY, viewType);
    } catch (error) {
      logger.debug('Failed to persist coloring view type to localStorage', { error });
    }
  }, [viewType]);

  const hasUserInteractedRef = useRef(false);
  const markUserInteraction = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  // Hydrate from saved nav-context exactly once when the URL had no filter params.
  const hasHydratedFromSavedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedFromSavedRef.current) return;
    if (urlProvidedInitial) {
      hasHydratedFromSavedRef.current = true;
      setIsNavigationContextReady(true);
      return;
    }
    if (savedContextQuery.isLoading || savedContextQuery.isFetching) return;
    hasHydratedFromSavedRef.current = true;
    if (hasUserInteractedRef.current) {
      setIsNavigationContextReady(true);
      return;
    }

    const saved = savedContextQuery.data?.filters;
    if (saved) {
      const { currentPage: _legacyCurrentPage, ...savedPreferences } = saved as typeof saved & {
        currentPage?: unknown;
      };
      setFiltersState(prev =>
        normalizeColoringStatusFilters({
          ...prev,
          ...savedPreferences,
          pageSize: normalizeColoringPagination(1, saved.pageSize).pageSize,
        })
      );
    }
    setIsNavigationContextReady(true);
  }, [
    urlProvidedInitial,
    savedContextQuery.isLoading,
    savedContextQuery.isFetching,
    savedContextQuery.data,
  ]);

  const {
    selectedStatuses,
    selectedPublishers,
    selectedIllustrators,
    selectedTags,
    mysteryOnly,
    includeArchived,
    includeDestashed,
    searchTerm,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
  } = filters;

  const searchString = searchParams.toString();

  useEffect(() => {
    if (!hasObservedInitialUrlRef.current) {
      hasObservedInitialUrlRef.current = true;
      return;
    }
    if (lastWrittenSearchRef.current === searchString) {
      lastWrittenSearchRef.current = null;
      return;
    }

    const urlFilters = getInitialColoringFiltersFromUrl(searchParams);
    const nextFilters = normalizeColoringStatusFilters({
      ...getDefaultColoringFilters(),
      ...urlFilters,
    });
    setFiltersState(current => (deepEqual(current, nextFilters) ? current : nextFilters));
  }, [searchParams, searchString]);

  // Bidirectional URL sync. Any field at its default deletes the param so URLs stay clean.
  useEffect(() => {
    if (!isNavigationContextReady) return;
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);

        next.delete('status');
        selectedStatuses.filter(Boolean).forEach(status => next.append('status', status));

        next.delete('publishers');
        selectedPublishers.filter(Boolean).forEach(id => next.append('publishers', id));

        next.delete('illustrators');
        selectedIllustrators.filter(Boolean).forEach(id => next.append('illustrators', id));

        next.delete('tags');
        selectedTags.filter(Boolean).forEach(id => next.append('tags', id));

        if (mysteryOnly) next.set('mystery', 'true');
        else next.delete('mystery');

        if (includeArchived) next.set('includeArchived', 'true');
        else next.delete('includeArchived');

        if (includeDestashed) next.set('includeDestashed', 'true');
        else next.delete('includeDestashed');

        if (searchTerm.trim() === '') next.delete('q');
        else next.set('q', searchTerm);

        if (sortField === 'date_added') next.delete('sort');
        else next.set('sort', sortField);

        if (sortDirection === 'desc') next.delete('dir');
        else next.set('dir', sortDirection);

        const nextWithPagination = setColoringPaginationParams(next, currentPage, pageSize);
        const nextSearch = nextWithPagination.toString();
        if (nextSearch === current.toString()) return current;
        lastWrittenSearchRef.current = nextSearch;
        return nextWithPagination;
      },
      { replace: true }
    );
  }, [
    selectedStatuses,
    selectedPublishers,
    selectedIllustrators,
    selectedTags,
    mysteryOnly,
    includeArchived,
    includeDestashed,
    searchTerm,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
    isNavigationContextReady,
    setSearchParams,
  ]);

  const setFilters = useCallback(
    (
      updates:
        | Partial<ColoringFilterState>
        | ((current: ColoringFilterState) => Partial<ColoringFilterState>)
    ) => {
      hasUserInteractedRef.current = true;
      logger.debug('Filter state update requested');
      setFiltersState(currentFilters => {
        const updateObj = typeof updates === 'function' ? updates(currentFilters) : updates;
        let newFilters: ColoringFilterState = normalizeColoringStatusFilters({
          ...currentFilters,
          ...updateObj,
        });
        if (!queryInputsEqual(currentFilters, newFilters)) {
          newFilters = { ...newFilters, currentPage: 1 };
        }
        if (deepEqual(newFilters, currentFilters)) {
          return currentFilters;
        }
        return newFilters;
      });
    },
    []
  );

  const setCurrentPage = useCallback(
    (page: number, options?: { replace?: boolean }) => {
      hasUserInteractedRef.current = true;
      const normalizedPage = normalizeColoringPagination(page, filters.pageSize).currentPage;
      if (normalizedPage === filters.currentPage) return;
      setFiltersState(current =>
        current.currentPage === normalizedPage
          ? current
          : { ...current, currentPage: normalizedPage }
      );
      setSearchParams(
        current => setColoringPaginationParams(current, normalizedPage, filters.pageSize),
        { replace: options?.replace ?? false }
      );
    },
    [filters.currentPage, filters.pageSize, setSearchParams]
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      hasUserInteractedRef.current = true;
      const normalizedPageSize = normalizeColoringPagination(1, pageSize).pageSize;
      setFiltersState(current => ({
        ...current,
        currentPage: 1,
        pageSize: normalizedPageSize,
      }));
      setSearchParams(current => setColoringPaginationParams(current, 1, normalizedPageSize), {
        replace: false,
      });
    },
    [setSearchParams]
  );

  const persistedFilters = useMemo(
    () => ({
      selectedStatuses,
      selectedPublishers,
      selectedIllustrators,
      selectedTags,
      mysteryOnly,
      includeArchived,
      includeDestashed,
      searchTerm,
      sortField,
      sortDirection,
      pageSize,
    }),
    [
      selectedStatuses,
      selectedPublishers,
      selectedIllustrators,
      selectedTags,
      mysteryOnly,
      includeArchived,
      includeDestashed,
      searchTerm,
      sortField,
      sortDirection,
      pageSize,
    ]
  );

  // Debounced save to nav-context whenever filters change post-interaction.
  // Skipped during the hydration window and when the user has not yet acted,
  // avoids round-tripping the freshly-loaded state back to the server.
  useEffect(() => {
    if (!user?.id) return;
    if (!hasHydratedFromSavedRef.current) return;
    if (!hasUserInteractedRef.current) return;

    pendingSaveRef.current = {
      userId: user.id,
      navigationContext: { filters: persistedFilters },
    };
    const handle = window.setTimeout(() => {
      const pendingSave = pendingSaveRef.current;
      if (!pendingSave) return;
      pendingSaveRef.current = null;
      saveContextMutateRef.current(pendingSave);
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
    // saveContext is intentionally omitted: it's a stable mutation result and
    // including it would re-run the effect on every mutation status change.
  }, [user?.id, persistedFilters, isNavigationContextReady]);

  useEffect(
    () => () => {
      const pendingSave = pendingSaveRef.current;
      if (!pendingSave) return;
      pendingSaveRef.current = null;
      saveContextMutateRef.current(pendingSave);
    },
    []
  );

  const activeFilterCount = useMemo(() => getActiveColoringFilterCount(filters), [filters]);

  const publishers: ColoringPublisherOption[] = useMemo(() => {
    const items = publishersQuery.data?.items ?? [];
    return items.map(p => ({ id: p.id, name: p.name }));
  }, [publishersQuery.data?.items]);

  const illustrators: ColoringFilterOption[] = useMemo(() => {
    const items = illustratorsQuery.data?.items ?? [];
    return items.map(illustrator => ({ id: illustrator.id, name: illustrator.name }));
  }, [illustratorsQuery.data?.items]);

  const tags: ColoringFilterOption[] = useMemo(
    () => (tagsQuery.data ?? []).map(tag => ({ id: tag.id, name: tag.name })),
    [tagsQuery.data]
  );

  const isLoading = publishersQuery.isLoading || illustratorsQuery.isLoading || tagsQuery.isLoading;

  const contextValue: ColoringFilterContextType = useMemo(
    () => ({
      filters,
      markUserInteraction,
      setFilters,
      setCurrentPage,
      setPageSize,
      publishers,
      illustrators,
      tags,
      isLoading,
      activeFilterCount,
      isNavigationContextReady,
      viewType,
      setViewType,
    }),
    [
      filters,
      markUserInteraction,
      setFilters,
      setCurrentPage,
      setPageSize,
      publishers,
      illustrators,
      tags,
      isLoading,
      activeFilterCount,
      isNavigationContextReady,
      viewType,
      setViewType,
    ]
  );

  return (
    <ColoringFilterContext.Provider value={contextValue}>{children}</ColoringFilterContext.Provider>
  );
};

export const useColoringFilters = () => {
  const context = useContext(ColoringFilterContext);
  if (!context) {
    throw new Error('useColoringFilters must be used within a ColoringFilterProvider');
  }
  return context;
};

export const useColoringFilterHelpers = () => {
  const { setCurrentPage, setFilters, setPageSize } = useColoringFilters();

  return useMemo(
    () => ({
      updateStatuses: (selectedStatuses: ColoringFilterState['selectedStatuses']) =>
        setFilters({ selectedStatuses: Array.from(new Set(selectedStatuses.filter(Boolean))) }),
      updatePublishers: (selectedPublishers: string[]) =>
        setFilters({ selectedPublishers: Array.from(new Set(selectedPublishers.filter(Boolean))) }),
      updateIllustrators: (selectedIllustrators: string[]) =>
        setFilters({
          selectedIllustrators: Array.from(new Set(selectedIllustrators.filter(Boolean))),
        }),
      updateTags: (selectedTags: string[]) =>
        setFilters({ selectedTags: Array.from(new Set(selectedTags.filter(Boolean))) }),
      updateMysteryOnly: (mysteryOnly: boolean) => setFilters({ mysteryOnly }),
      updateIncludeArchived: (includeArchived: boolean) => setFilters({ includeArchived }),
      updateIncludeDestashed: (includeDestashed: boolean) => setFilters({ includeDestashed }),
      updateSearch: (searchTerm: string) => setFilters({ searchTerm }),
      updateSort: (sortField: ColoringSortField, sortDirection: ColoringSortDirection) =>
        setFilters({ sortField, sortDirection }),
      updatePage: (currentPage: number, options?: { replace?: boolean }) =>
        setCurrentPage(currentPage, options),
      updatePageSize: (pageSize: number) => setPageSize(pageSize),
      resetFilters: () => setFilters(getDefaultColoringFilters()),
      clearActiveFilters: () => setFilters(getActiveColoringFilterResetPatch()),
    }),
    [setCurrentPage, setFilters, setPageSize]
  );
};
