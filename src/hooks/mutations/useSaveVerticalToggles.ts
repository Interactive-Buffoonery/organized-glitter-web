import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DashboardSettingsService,
  type VerticalToggles,
} from '@/services/pocketbase/dashboardSettings.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useSaveVerticalToggles');

interface SaveVerticalTogglesParams {
  userId: string;
  verticals: VerticalToggles;
}

const saveVerticalToggles = async ({
  userId,
  verticals,
}: SaveVerticalTogglesParams): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required');
  }
  return DashboardSettingsService.saveVerticalToggles(userId, verticals);
};

export const useSaveVerticalToggles = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveVerticalToggles,
    mutationKey: ['saveVerticalToggles', userId],
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSettings.verticals(variables.userId),
      });
      logger.info(`Saved vertical toggles for user ${variables.userId}`);
    },
    onError: (error, variables) => {
      logger.error(`Failed to save vertical toggles for user ${variables.userId}:`, error);
    },
  });
};
