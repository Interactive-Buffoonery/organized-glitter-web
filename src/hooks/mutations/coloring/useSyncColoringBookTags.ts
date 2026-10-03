import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { isServiceResponseError } from '@/types/shared';
import { createLogger } from '@/utils/logger';
import { refreshColoringBookTags } from './coloringMutationCache';

const logger = createLogger('useSyncColoringBookTags');

interface SyncColoringBookTagsVariables {
  bookId: string;
  tagIds: string[];
}

export function useSyncColoringBookTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookId, tagIds }: SyncColoringBookTagsVariables) =>
      ColoringTagService.syncBookTags(bookId, tagIds),
    onSuccess: async (response, { bookId }) => {
      if (isServiceResponseError(response)) return;

      runPostWriteEffect(logger, 'Coloring Stats refresh failed after tag sync', () => {
        invalidateStatsQueries(queryClient, 'coloring');
      });
      await refreshColoringBookTags(queryClient, bookId);
    },
  });
}
