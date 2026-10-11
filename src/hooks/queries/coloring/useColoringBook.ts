import { useQuery } from '@tanstack/react-query';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useColoringBook(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.books.detail(id || ''),
    queryFn: () => ColoringService.getBookById(id!),
    enabled: !!id,
    ...queryFreshness('frequent'),
  });
}
