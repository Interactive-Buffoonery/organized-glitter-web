/**
 * Query hook that reads the user's saved coloring filter state from
 * `user_dashboard_settings.coloring_navigation_context`. Used by
 * `ColoringFilterProvider` to hydrate filters on first mount when the URL
 * carries no filter params.
 *
 * Returns `null` (not undefined) when the user has no saved coloring context
 * yet, so the caller can distinguish "loaded, nothing saved" from "still
 * loading."
 */

import { useQuery } from '@tanstack/react-query';
import { DashboardSettingsService } from '@/services/pocketbase/dashboardSettings.service';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import type { ColoringNavigationContext } from '@/hooks/mutations/useSaveColoringNavigationContext';
import { queryKeys } from './queryKeys';

export const useColoringNavigationContext = (userId: string | undefined) => {
  return useQuery<ColoringNavigationContext | null>({
    queryKey: userId
      ? queryKeys.dashboardSettings.coloringNavigationContext(userId)
      : ['dashboardSettings', 'coloringNavigationContext', 'anonymous'],
    queryFn: async () => {
      if (!userId) return null;
      const raw = await DashboardSettingsService.getColoringNavigationContext(userId);
      if (!raw || typeof raw !== 'object') return null;
      return raw as ColoringNavigationContext;
    },
    enabled: Boolean(userId),
    ...queryFreshness('frequent'),
  });
};
