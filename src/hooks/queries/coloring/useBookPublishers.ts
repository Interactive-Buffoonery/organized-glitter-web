import { useQuery } from '@tanstack/react-query';
import { BookPublishersService } from '@/services/pocketbase/bookPublishers.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

export function useBookPublishers(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.publishers.list(userId),
    queryFn: () => BookPublishersService.listAll(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
