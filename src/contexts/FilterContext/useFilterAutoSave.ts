import { useEffect, useRef } from 'react';

import { useSaveNavigationContext } from '@/hooks/mutations/useSaveNavigationContext';
import useDebounce from '@/hooks/useDebounce';
import { createLogger } from '@/utils/logger';
import { getPageScrollY } from '@/utils/scrollPosition';

import { areFiltersEqual, useFilterState } from './FilterStateContext';
import { FilterState } from './types';

const filterLogger = createLogger('FilterProvider');

interface UseFilterAutoSaveOptions {
  userId?: string;
}

export const useFilterAutoSave = ({ userId }: UseFilterAutoSaveOptions) => {
  const { filters } = useFilterState();
  const saveFiltersMutation = useSaveNavigationContext(userId || 'no-user');
  const debouncedFilters = useDebounce(filters, 1000);
  const lastSavedFiltersRef = useRef<FilterState>(filters);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (!userId || !debouncedFilters || isSavingRef.current) return;

    if (areFiltersEqual(lastSavedFiltersRef.current, debouncedFilters)) {
      return;
    }

    isSavingRef.current = true;

    saveFiltersMutation.mutate(
      {
        userId,
        navigationContext: {
          filters: {
            status: debouncedFilters.activeStatus,
            company: debouncedFilters.selectedCompany,
            artist: debouncedFilters.selectedArtist,
            drillShape: debouncedFilters.selectedDrillShape,
            yearFinished: debouncedFilters.selectedYearFinished,
            includeMiniKits: debouncedFilters.includeMiniKits,
            includeDestashed: debouncedFilters.includeDestashed,
            includeArchived: debouncedFilters.includeArchived,
            searchTerm: debouncedFilters.searchTerm,
            searchAllFields: debouncedFilters.searchAllFields,
            selectedTags: debouncedFilters.selectedTags,
          },
          sortField: debouncedFilters.sortField,
          sortDirection: debouncedFilters.sortDirection,
          currentPage: debouncedFilters.currentPage,
          pageSize: debouncedFilters.pageSize,
          preservationContext: {
            scrollPosition: getPageScrollY(),
            timestamp: Date.now(),
          },
        },
      },
      {
        onSuccess: () => {
          lastSavedFiltersRef.current = debouncedFilters;
          isSavingRef.current = false;
        },
        onError: error => {
          isSavingRef.current = false;
          filterLogger.criticalError('Failed to auto-save filter preferences', { error });
        },
      }
    );
  }, [debouncedFilters, userId, saveFiltersMutation]);
};
