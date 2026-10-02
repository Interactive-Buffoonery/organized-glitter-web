import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { isServiceResponseError } from '@/types/shared';

export function useColoringTags() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.coloring.tags.list(user?.id),
    queryFn: async () => {
      const result = await ColoringTagService.listColoringTags();
      if (isServiceResponseError(result)) {
        throw new Error(result.error?.message || 'Failed to load coloring tags');
      }
      return result.data;
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });
}
