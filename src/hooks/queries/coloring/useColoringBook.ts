import { useQuery } from '@tanstack/react-query';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

export function useColoringBook(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.books.detail(id || ''),
    queryFn: () => ColoringService.getBookById(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
