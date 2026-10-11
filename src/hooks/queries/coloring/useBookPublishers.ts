import { useQuery } from '@tanstack/react-query';
import { BookPublishersService } from '@/services/pocketbase/bookPublishers.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useBookPublishers(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.publishers.list(userId),
    queryFn: () => BookPublishersService.listAll(userId!),
    enabled: !!userId,
    ...queryFreshness('frequent'),
    retry: 2,
  });
}
