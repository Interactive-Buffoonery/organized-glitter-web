import { notify } from '@/lib/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TagService } from '@/services/pocketbase/tags.service';
import { queryKeys } from '../queries/queryKeys';
import { useAuth } from '@/hooks/useAuth';

import { isServiceResponseError } from '@/types/shared';
import { requireAuthenticatedUser } from '@/services/auth';
import { isRecordInUseError } from '@/services/errors';
import { logger } from '@/utils/logger';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

interface DeleteTagData {
  id: string;
  name?: string; // Optional for better error messages
}

async function deleteTag(data: DeleteTagData): Promise<void> {
  const response = await TagService.deleteTag(data.id);

  if (isServiceResponseError(response)) {
    throw new Error(response.error?.message || 'Failed to delete tag');
  }

  return;
}

export function useDeleteTag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DeleteTagData) => {
      requireAuthenticatedUser(user);
      return deleteTag(data);
    },
    onSuccess: (_, variables) => {
      invalidateStatsQueries(queryClient, 'diamond');
      capture(AnalyticsEvent.TAG_DELETED);
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

      // Invalidate project details since they might show tags
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.details(),
      });

      // Invalidate tag stats queries (since deleting a tag affects project counts)
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.stats(),
      });

      notify({
        kind: 'success',
        title: 'Tag deleted',
        description: variables.name
          ? `Tag "${variables.name}" has been deleted`
          : 'Tag has been deleted successfully',
      });
    },
    onError: (error: unknown) => {
      logger.error('Error deleting tag:', error);

      // Handle specific error cases
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isRecordInUseError(error)) {
        notify({
          kind: 'error',
          title: 'Tag is in use',
          description: 'Remove it from projects before deleting it.',
        });
      } else if (errorMessage.includes('Unauthorized')) {
        notify({
          kind: 'error',
          title: 'Unauthorized',
          description: 'You can only delete your own tags',
        });
      } else if (errorMessage.includes('not found')) {
        notify({
          kind: 'error',
          title: 'Tag not found',
          description: 'The tag you are trying to delete was not found',
        });
      } else {
        notify({
          kind: 'error',
          title: 'Tag deletion failed',
          description: 'Could not delete tag. Please try again.',
        });
      }
    },
  });
}
