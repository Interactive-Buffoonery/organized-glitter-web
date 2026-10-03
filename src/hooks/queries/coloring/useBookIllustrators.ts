import { useQuery } from '@tanstack/react-query';
import { BookIllustratorsService } from '@/services/pocketbase/bookIllustrators.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

export function useBookIllustrators(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.illustrators.list(userId),
    queryFn: () => BookIllustratorsService.listAll(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
