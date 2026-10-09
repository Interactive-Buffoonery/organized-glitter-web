import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ColoringService,
  type ColoringBookListOptions,
} from '@/services/pocketbase/coloring.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useColoringBooks(filters: ColoringBookListOptions | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.books.list(filters ?? { userId: '' }),
    queryFn: () => ColoringService.listBooks(filters!),
    enabled: !!filters?.userId,
    placeholderData: keepPreviousData,
    ...queryFreshness('frequent'),
  });
}
