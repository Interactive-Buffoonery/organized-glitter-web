import { notify } from '@/lib/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TagService } from '@/services/pocketbase/tags.service';
import { TagFormValues } from '@/types/tag';
import { queryKeys } from '../queries/queryKeys';
import { useAuth } from '@/hooks/useAuth';

import { isServiceResponseError } from '@/types/shared';
import { requireAuthenticatedUser } from '@/services/auth';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { logger } from '@/utils/logger';
import type { Tag } from '@/types/tag';

async function createTag(data: TagFormValues): Promise<Tag> {
  const response = await TagService.createTag(data);

  if (isServiceResponseError(response)) {
    throw new Error(response.error?.message || 'Failed to create tag');
  }

  return response.data;
}

export function useCreateTag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TagFormValues) => {
      requireAuthenticatedUser(user);
      return createTag(data);
    },
    onSuccess: tag => {
      capture(AnalyticsEvent.TAG_CREATED, { craft: 'diamond' });

      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.lists(),
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.stats(),
      });

      notify({
        kind: 'success',
        title: 'Tag created',
        description: `Tag "${tag.name}" has been created`,
      });
    },
    onError: (error: unknown) => {
      logger.error('Error creating tag:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('already exists')) {
        notify({
          kind: 'error',
          title: 'Tag name already exists',
          description: 'A tag with this name already exists in your list',
        });
      } else {
        notify({
          kind: 'error',
          title: 'Tag creation failed',
          description: 'Could not create tag. Please try again.',
        });
      }
    },
  });
}
