import { useMemo } from 'react';
import { useFilters } from '@/contexts/FilterContext';
import { useMetadata } from '@/contexts/MetadataContext';
import { buildDashboardEmptyState, type DashboardEmptyState } from '@/hooks/dashboardEmptyState';

export const useDashboardEmptyState = (): DashboardEmptyState => {
  const { filters } = useFilters();
  const { companies, artists, tags } = useMetadata();

  return useMemo(
    () =>
      buildDashboardEmptyState(filters, {
        companies,
        artists,
        tags,
      }),
    [filters, companies, artists, tags]
  );
};
