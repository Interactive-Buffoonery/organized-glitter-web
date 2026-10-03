import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { DashboardSettingsService } from '@/services/pocketbase/dashboardSettings.service';
import { DEFAULT_RANDOMIZER_NEXT_UP, type RandomizerNextUpPreferences } from '@/types/randomizer';

const STALE_TIME_MS = 5 * 60 * 1000;

export const useRandomizerNextUp = (userId: string | undefined) => {
  return useQuery<RandomizerNextUpPreferences>({
    queryKey: queryKeys.dashboardSettings.randomizerNextUp(userId ?? 'anonymous'),
    queryFn: async () => {
      if (!userId) return { ...DEFAULT_RANDOMIZER_NEXT_UP, targets: {} };
      return DashboardSettingsService.getRandomizerNextUp(userId);
    },
    enabled: Boolean(userId),
    staleTime: STALE_TIME_MS,
    placeholderData: { ...DEFAULT_RANDOMIZER_NEXT_UP, targets: {} },
  });
};
