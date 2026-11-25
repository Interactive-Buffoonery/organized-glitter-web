import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { mergeUpdatedTagIntoTagQueriesCache } from '@/hooks/mutations/useUpdateTag';
import { notify } from '@/lib/notifications';
import { requireAuthenticatedUser } from '@/services/auth';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { isServiceResponseError } from '@/types/shared';
import type { Tag, TagFormValues } from '@/types/tag';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useUpdateColoringTag');

interface UpdateColoringTagData {
  id: string;
  updates: Partial<TagFormValues>;
}

async function updateColoringTag(data: UpdateColoringTagData): Promise<Tag> {
  const response = await ColoringTagService.updateColoringTag(data.id, data.updates);

  if (isServiceResponseError(response)) {
    throw new Error(response.error?.message || 'Failed to update coloring tag');
  }

  return response.data;
}

export function useUpdateColoringTag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateColoringTagData) => {
      requireAuthenticatedUser(user);
      return updateColoringTag(data);
    },
    onSuccess: (updated, variables) => {
      invalidateStatsQueries(queryClient, 'coloring');
      queryClient.setQueriesData({ queryKey: queryKeys.coloring.tags.lists() }, cached =>
        mergeUpdatedTagIntoTagQueriesCache(cached, variables.id, {
          name: updated.name,
          slug: updated.slug,
          color: updated.color,
        })
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.tags.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.books.all });

      notify({
        kind: 'success',
        title: 'Coloring tag updated',
        description: 'Coloring tag has been updated successfully',
      });
    },
    onError: (error: unknown) => {
      logger.error('Error updating coloring tag:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('already exists')) {
        notify({
          kind: 'error',
          title: 'Coloring tag name already exists',
          description: 'A coloring tag with this name already exists in your list',
        });
      } else if (errorMessage.includes('Unauthorized')) {
        notify({
          kind: 'error',
          title: 'Unauthorized',
          description: 'You can only update your own coloring tags',
        });
      } else {
        notify({
          kind: 'error',
          title: 'Coloring tag update failed',
          description: 'Could not update coloring tag. Please try again.',
        });
      }
    },
  });
}
