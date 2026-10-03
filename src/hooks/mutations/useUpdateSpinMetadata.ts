import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notifications';
import { randomizerQueryKeys } from '@/hooks/queries/useSpinHistory';
import { updateSpinMetadata } from '@/services/pocketbase/randomizerService';
import { createLogger } from '@/utils/logger';
import type { RandomizerSpinMetadata } from '@/types/randomizer';

const logger = createLogger('useUpdateSpinMetadata');

export function useUpdateSpinMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      spinId,
      metadata,
    }: {
      userId: string;
      spinId: string;
      metadata: RandomizerSpinMetadata;
    }) => updateSpinMetadata(spinId, metadata),

    onSuccess: (updated, { userId, spinId, metadata }) => {
      queryClient.setQueriesData(
        { queryKey: randomizerQueryKeys.historyLists(userId), exact: false },
        cached => {
          if (!Array.isArray(cached)) return cached;
          return cached.map(spin =>
            spin.id === spinId ? { ...spin, metadata: updated.metadata ?? metadata } : spin
          );
        }
      );

      queryClient.invalidateQueries({
        queryKey: randomizerQueryKeys.historyLists(userId),
        exact: false,
      });
    },

    onError: error => {
      logger.error('Failed to update spin metadata', { error });
      notify({
        kind: 'error',
        title: 'Spin history not updated',
        description: 'The result is still shown here, but history could not be updated.',
      });
    },
  });
}
