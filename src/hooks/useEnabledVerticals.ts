import { useQuery } from '@tanstack/react-query';
import {
  DashboardSettingsService,
  DEFAULT_VERTICAL_TOGGLES,
  type VerticalToggles,
} from '@/services/pocketbase/dashboardSettings.service';
import { queryKeys } from './queries/queryKeys';

export type UseEnabledVerticalsResult = VerticalToggles & {
  isLoading: boolean;
};

export const useEnabledVerticals = (userId: string | undefined): UseEnabledVerticalsResult => {
  const { data, isLoading } = useQuery({
    queryKey: userId
      ? queryKeys.dashboardSettings.verticals(userId)
      : ['dashboardSettings', 'verticals', 'disabled'],
    queryFn: () => DashboardSettingsService.getVerticalToggles(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const resolved =
    data && (data.diamond_painting || data.coloring_books) ? data : DEFAULT_VERTICAL_TOGGLES;
  return {
    diamond_painting: resolved.diamond_painting,
    coloring_books: resolved.coloring_books,
    isLoading,
  };
};
