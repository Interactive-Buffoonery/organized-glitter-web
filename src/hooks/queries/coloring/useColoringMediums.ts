import { useQuery } from '@tanstack/react-query';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useColoringMediums(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.mediums.list(userId),
    queryFn: () => ColoringMediumsService.listColoringMediums(userId!),
    enabled: !!userId,
    ...queryFreshness('frequent'),
    retry: 2,
  });
}
