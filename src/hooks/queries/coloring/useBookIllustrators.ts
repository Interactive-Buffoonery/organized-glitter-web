import { useQuery } from '@tanstack/react-query';
import { BookIllustratorsService } from '@/services/pocketbase/bookIllustrators.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useBookIllustrators(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.illustrators.list(userId),
    queryFn: () => BookIllustratorsService.listAll(userId!),
    enabled: !!userId,
    ...queryFreshness('frequent'),
    retry: 2,
  });
}
