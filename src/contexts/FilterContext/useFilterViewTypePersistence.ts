import { useEffect } from 'react';

import { createLogger } from '@/utils/logger';

import { useFilterState } from './FilterStateContext';
import { VIEW_TYPE_STORAGE_KEY } from './types';

const filterLogger = createLogger('FilterProvider');

export const useFilterViewTypePersistence = () => {
  const {
    filters: { viewType },
  } = useFilterState();

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(VIEW_TYPE_STORAGE_KEY, viewType);
    } catch (error) {
      filterLogger.debug('Failed to persist view type to localStorage', { error });
    }
  }, [viewType]);
};
