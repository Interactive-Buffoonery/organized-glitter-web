/**
 * Cold-mount fallback for dashboard filter state.
 *
 * When the dashboard mounts without a forwarded `location.state.navigationContext`
 * (typed URL, refresh, browser-restart, fresh tab) and without URL filter
 * params, this query loads the user's last persisted snapshot from PocketBase
 * so they land back on the same status / sort / page they last left the
 * dashboard on. Auto-save still owns writes; this hook only reads.
 */

import { useQuery } from '@tanstack/react-query';
import { DashboardSettingsService } from '@/services/pocketbase/dashboardSettings.service';
import { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';
import { queryKeys } from './queryKeys';

interface UseDashboardNavigationContextOptions {
  enabled?: boolean;
}

export const useDashboardNavigationContext = (
  userId: string | null | undefined,
  { enabled = true }: UseDashboardNavigationContextOptions = {}
) => {
  return useQuery<DashboardFilterContext | null>({
    queryKey: userId ? queryKeys.user.dashboardNavigationContext(userId) : ['no-user'],
    queryFn: () =>
      DashboardSettingsService.loadNavigationContext<DashboardFilterContext>(userId as string),
    enabled: Boolean(userId) && enabled,
    // Cold mounts should always ask PocketBase for the latest autosaved
    // snapshot instead of reusing a cached value from a prior dashboard visit.
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};
