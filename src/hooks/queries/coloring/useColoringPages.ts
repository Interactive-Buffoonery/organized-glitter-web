import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ColoringService,
  type ColoringPagesListOptions,
} from '@/services/pocketbase/coloring.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useColoringPages(filters: ColoringPagesListOptions | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.coloring.pages.list(filters ?? { bookId: '' }),
    queryFn: () => ColoringService.listPages(filters!),
    enabled: !!filters?.bookId,
    ...queryFreshness('frequent'),
  });

  useEffect(() => {
    query.data?.items.forEach(page => {
      const detailKey = queryKeys.coloring.pages.detail(page.id);
      // A failed detail (such as a 403) owns its own recovery. Seeding over it
      // would clear the error and show a page the user cannot view.
      if (queryClient.getQueryState(detailKey)?.status === 'error') return;
      queryClient.setQueryData(detailKey, page);
    });
  }, [query.data, queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
