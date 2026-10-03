import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { isServiceResponseError } from '@/types/shared';

export function useColoringBookTags(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.coloring.tags.book(bookId || ''),
    queryFn: async () => {
      const result = await ColoringTagService.getBookTags(bookId!);
      if (isServiceResponseError(result)) {
        throw new Error(result.error?.message || 'Failed to load coloring book tags');
      }
      return result.data;
    },
    enabled: Boolean(bookId),
    staleTime: 5 * 60 * 1000,
  });
}
