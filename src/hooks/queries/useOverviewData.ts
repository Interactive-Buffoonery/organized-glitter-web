import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { OverviewService } from '@/services/pocketbase/overview.service';
import type { VerticalToggles } from '@/services/pocketbase/dashboardSettings.service';

interface UseOverviewDataOptions {
  verticals?: VerticalToggles;
  enabled?: boolean;
}

export function useOverviewData(options: UseOverviewDataOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { verticals, enabled = true } = options;

  return useQuery({
    queryKey: [
      ...queryKeys.stats.overview(userId || 'anonymous'),
      verticals?.diamond_painting ?? 'default',
      verticals?.coloring_books ?? 'default',
    ],
    queryFn: () => OverviewService.getOverviewData(userId!, verticals),
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
