import { notify } from '@/lib/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TagService } from '@/services/pocketbase/tags.service';
import type { Tag, TagFormValues } from '@/types/tag';
import { queryKeys } from '../queries/queryKeys';
import { useAuth } from '@/hooks/useAuth';

import { isServiceResponseError } from '@/types/shared';
import { requireAuthenticatedUser } from '@/services/auth';
import { logger } from '@/utils/logger';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

interface UpdateTagData {
  id: string;
  updates: Partial<TagFormValues>;
}

async function updateTag(data: UpdateTagData): Promise<Tag> {
  const response = await TagService.updateTag(data.id, data.updates);

  if (isServiceResponseError(response)) {
    throw new Error(response.error?.message || 'Failed to update tag');
  }

  return response.data;
}

/**
 * Merges an updated tag into cached `Tag[]` queries so the table reflects the new
 * name/color before the background refetch resolves (same class as #108).
 * Exported for unit tests.
 */
export function mergeUpdatedTagIntoTagQueriesCache(
  data: unknown,
  id: string,
  patch: Pick<Tag, 'name' | 'slug' | 'color'>
): unknown {
  if (!Array.isArray(data)) return data;

  let changed = false;
  const next = (data as Tag[]).map(item => {
    if (item.id === id) {
      changed = true;
      return { ...item, ...patch };
    }
    return item;
  });
  if (!changed) return data;
  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export function useUpdateTag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateTagData) => {
      requireAuthenticatedUser(user);
      return updateTag(data);
    },
    onSuccess: (updated, variables) => {
      invalidateStatsQueries(queryClient, 'diamond');
      capture(AnalyticsEvent.TAG_UPDATED);

      // Merge server response into cached tag list queries so the table updates
      // before the invalidation-triggered refetch resolves.
      queryClient.setQueriesData({ queryKey: queryKeys.tags.lists() }, cached =>
        mergeUpdatedTagIntoTagQueriesCache(cached, variables.id, {
          name: updated.name,
          slug: updated.slug,
          color: updated.color,
        })
      );

      // Invalidate and refetch tags list
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.lists(),
      });

      // Also invalidate specific tag detail if it exists
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.detail(variables.id),
      });

      // Invalidate project queries since tags might be displayed there
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.lists(),
      });

      notify({
        kind: 'success',
        title: 'Tag updated',
        description: `Tag has been updated successfully`,
      });
    },
    onError: (error: unknown) => {
      logger.error('Error updating tag:', error);

      // Handle specific error cases
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('already exists')) {
        notify({
          kind: 'error',
          title: 'Tag name already exists',
          description: 'A tag with this name already exists in your list',
        });
      } else if (errorMessage.includes('Unauthorized')) {
        notify({
          kind: 'error',
          title: 'Unauthorized',
          description: 'You can only update your own tags',
        });
      } else {
        notify({
          kind: 'error',
          title: 'Tag update failed',
          description: 'Could not update tag. Please try again.',
        });
      }
    },
  });
}
