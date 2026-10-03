import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ColoringService,
  type ColoringPagesListOptions,
} from '@/services/pocketbase/coloring.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

export function useColoringPages(filters: ColoringPagesListOptions | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.coloring.pages.list(filters ?? { bookId: '' }),
    queryFn: () => ColoringService.listPages(filters!),
    enabled: !!filters?.bookId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  useEffect(() => {
    query.data?.items.forEach(page => {
      queryClient.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
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
