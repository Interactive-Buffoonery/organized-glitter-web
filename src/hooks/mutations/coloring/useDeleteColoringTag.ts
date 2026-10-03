import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { notify } from '@/lib/notifications';
import { requireAuthenticatedUser } from '@/services/auth';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { isRecordInUseError } from '@/services/errors';
import { isServiceResponseError } from '@/types/shared';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useDeleteColoringTag');

interface DeleteColoringTagData {
  id: string;
  name?: string;
}

async function deleteColoringTag(data: DeleteColoringTagData): Promise<void> {
  const response = await ColoringTagService.deleteColoringTag(data.id);

  if (isServiceResponseError(response)) {
    throw new Error(response.error?.message || 'Failed to delete coloring tag');
  }
}

export function useDeleteColoringTag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DeleteColoringTagData) => {
      requireAuthenticatedUser(user);
      return deleteColoringTag(data);
    },
    onSuccess: (_, variables) => {
      invalidateStatsQueries(queryClient, 'coloring');
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.tags.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.books.all });

      notify({
        kind: 'success',
        title: 'Coloring tag deleted',
        description: variables.name
          ? `Coloring tag "${variables.name}" has been deleted`
          : 'Coloring tag has been deleted',
      });
    },
    onError: (error: unknown) => {
      logger.error('Error deleting coloring tag:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isRecordInUseError(error)) {
        notify({
          kind: 'error',
          title: 'Coloring tag is in use',
          description: 'Remove it from books before deleting it.',
        });
      } else if (errorMessage.includes('Unauthorized')) {
        notify({
          kind: 'error',
          title: 'Unauthorized',
          description: 'You can only delete your own coloring tags',
        });
      } else {
        notify({
          kind: 'error',
          title: 'Coloring tag deletion failed',
          description: 'Could not delete coloring tag. Please try again.',
        });
      }
    },
  });
}
