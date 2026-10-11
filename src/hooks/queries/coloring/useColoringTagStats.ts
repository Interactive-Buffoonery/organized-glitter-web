import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { isServiceResponseError } from '@/types/shared';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useColoringTagStats(tagIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.coloring.tags.stat(user?.id || '', tagIds),
    queryFn: async () => {
      const result = await ColoringTagService.getBulkColoringTagStats(tagIds);
      if (isServiceResponseError(result)) {
        throw new Error(result.error?.message || 'Failed to load coloring tag stats');
      }
      return result.data;
    },
    enabled: Boolean(user?.id) && tagIds.length > 0,
    ...queryFreshness('frequent'),
  });
}
