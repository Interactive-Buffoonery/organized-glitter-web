import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { onAuthChange } from '@/services/auth';
import { DashboardSettingsService } from '@/services/pocketbase/dashboardSettings.service';
import { createLogger } from '@/utils/logger';
import type { RandomizerNextUpPreferences } from '@/types/randomizer';

const logger = createLogger('useSaveRandomizerNextUp');

const CACHE_MAX_SIZE = 100;
const settingsIdCache = new Map<string, string>();

const setCacheEntry = (userId: string, id: string) => {
  if (settingsIdCache.size >= CACHE_MAX_SIZE && !settingsIdCache.has(userId)) {
    const firstKey = settingsIdCache.keys().next().value as string | undefined;
    if (firstKey) settingsIdCache.delete(firstKey);
  }
  settingsIdCache.set(userId, id);
};

let lastUserId: string | null = null;

onAuthChange((_token, record) => {
  const currentId = record?.id ?? null;
  if (lastUserId && currentId !== lastUserId) {
    settingsIdCache.delete(lastUserId);
  }
  lastUserId = currentId;
}, true);

interface SaveRandomizerNextUpParams {
  userId: string;
  preferences: RandomizerNextUpPreferences;
}

const saveRandomizerNextUp = async ({
  userId,
  preferences,
}: SaveRandomizerNextUpParams): Promise<RandomizerNextUpPreferences> => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  try {
    const cachedId = settingsIdCache.get(userId);
    const recordId = await DashboardSettingsService.saveRandomizerNextUp(
      userId,
      preferences,
      cachedId
    );
    setCacheEntry(userId, recordId);
    return preferences;
  } catch (error) {
    settingsIdCache.delete(userId);
    logger.error('Error saving randomizer next-up preferences:', error);
    throw error;
  }
};

export const useSaveRandomizerNextUp = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveRandomizerNextUp,
    mutationKey: ['saveRandomizerNextUp', userId],
    onMutate: async variables => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.dashboardSettings.randomizerNextUp(variables.userId),
      });
      const previous = queryClient.getQueryData<RandomizerNextUpPreferences>(
        queryKeys.dashboardSettings.randomizerNextUp(variables.userId)
      );
      queryClient.setQueryData(
        queryKeys.dashboardSettings.randomizerNextUp(variables.userId),
        variables.preferences
      );
      return { previous };
    },
    onSuccess: (preferences, variables) => {
      queryClient.setQueryData(
        queryKeys.dashboardSettings.randomizerNextUp(variables.userId),
        preferences
      );
      logger.info('Successfully saved randomizer next-up preferences');
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.dashboardSettings.randomizerNextUp(variables.userId),
          context.previous
        );
      }
      logger.error('Failed to save randomizer next-up preferences:', error);
    },
    retry: false,
  });
};
