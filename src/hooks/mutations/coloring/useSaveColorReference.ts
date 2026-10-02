import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colorReferenceKey } from '@/hooks/queries/coloring/useColorReference';
import {
  ColorReferencesService,
  type ColorReferenceChange,
} from '@/services/pocketbase/colorReferences.service';
import { getCurrentUserId } from '@/services/auth';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColorReference');

export function useSaveColorReference(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: ColorReferenceChange) =>
      ColorReferencesService.save(pageId, userId, change),
    onSuccess: reference => {
      if (getCurrentUserId() !== userId) return;
      client.setQueryData(colorReferenceKey(userId, pageId), reference);
      void client
        .invalidateQueries({ queryKey: colorReferenceKey(userId, pageId) })
        .catch(() => logger.warn('Color reference saved; cache refresh failed.'));
    },
    onError: async (error, change) => {
      if (
        getCurrentUserId() !== userId ||
        change.action !== 'notes' ||
        !('status' in error) ||
        error.status !== 409
      )
        return;
      await client
        .invalidateQueries(
          { queryKey: colorReferenceKey(userId, pageId), exact: true, refetchType: 'all' },
          { throwOnError: true }
        )
        .catch(() => logger.warn('Could not refresh the conflicting color note.'));
    },
    retry: false,
  });
}
