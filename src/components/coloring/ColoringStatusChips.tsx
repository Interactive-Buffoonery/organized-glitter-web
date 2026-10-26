import { useQueries } from '@tanstack/react-query';
import { useColoringFilters, useColoringFilterHelpers } from '@/contexts/ColoringFilterContext';
import { StatusChips } from '@/components/shared/StatusChips';
import { COLORING_BOOK_STATUS_LABEL } from '@/utils/statusColors';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import {
  buildColoringBookListQueryConfig,
  toColoringBookListCriteria,
} from '@/services/pocketbase/coloringBookQueryBuilder';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import type { ColoringBooksStatusOptions } from '@/types/pocketbase.types';

const statuses: Array<ColoringBooksStatusOptions | 'all'> = [
  'all',
  'wishlist',
  'purchased',
  'in_stash',
  'in_progress',
  'completed',
];
export function ColoringStatusChips({ userId }: { userId: string }) {
  const { filters, isNavigationContextReady } = useColoringFilters();
  const { updateStatuses } = useColoringFilterHelpers();
  const counts = useQueries({
    queries: statuses.map(status => {
      const config = buildColoringBookListQueryConfig(
        toColoringBookListCriteria({
          ...filters,
          selectedStatuses: status === 'all' ? [] : [status],
        }),
        { field: 'date_added', direction: 'desc' }
      );
      const options = {
        userId,
        page: 1,
        perPage: 1,
        filter: config.filter,
        sort: config.sort,
      };
      return {
        queryKey: queryKeys.coloring.books.list(options),
        queryFn: () => ColoringService.listBooks(options),
        enabled: !!userId && isNavigationContextReady,
        ...queryFreshness('frequent'),
      };
    }),
  });
  return (
    <StatusChips
      value={filters.selectedStatuses.length ? filters.selectedStatuses : ['all']}
      options={statuses.map((status, index) => ({
        value: status,
        label: status === 'all' ? 'All' : COLORING_BOOK_STATUS_LABEL[status],
        count: counts[index].data?.totalItems,
      }))}
      onChange={status => updateStatuses(status === 'all' ? [] : [status])}
    />
  );
}
