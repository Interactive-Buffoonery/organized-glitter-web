import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { DashboardSettingsService } from '@/services/pocketbase/dashboardSettings.service';
import { DEFAULT_RANDOMIZER_NEXT_UP, type RandomizerNextUpPreferences } from '@/types/randomizer';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export const useRandomizerNextUp = (userId: string | undefined) => {
  return useQuery<RandomizerNextUpPreferences>({
    queryKey: queryKeys.dashboardSettings.randomizerNextUp(userId ?? 'anonymous'),
    queryFn: async () => {
      if (!userId) return { ...DEFAULT_RANDOMIZER_NEXT_UP, targets: {} };
      return DashboardSettingsService.getRandomizerNextUp(userId);
    },
    enabled: Boolean(userId),
    ...queryFreshness('frequent'),
    placeholderData: { ...DEFAULT_RANDOMIZER_NEXT_UP, targets: {} },
  });
};
