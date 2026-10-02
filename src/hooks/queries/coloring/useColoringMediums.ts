import { useQuery } from '@tanstack/react-query';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

export function useColoringMediums(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.mediums.list(userId),
    queryFn: () => ColoringMediumsService.listColoringMediums(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
