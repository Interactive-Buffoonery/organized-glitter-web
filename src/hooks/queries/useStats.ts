import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { queryKeys } from './queryKeys';

export const STATS_STALE_TIME = 2 * 60 * 1000;
export const STATS_GC_TIME = 10 * 60 * 1000;

type StatsQueryOptions = {
  enabled?: boolean;
};

export function useStatsSummary(year = new Date().getFullYear(), options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.summary(userId || 'anonymous', year),
    queryFn: () => projectsService.getStatsSummary(year),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useCompletionsByMonth(year: number, options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.completionsByMonth(userId || 'anonymous', year),
    queryFn: () => projectsService.getCompletionsByMonth(year),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useCompletionsYearly(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.completionsYearly(userId || 'anonymous'),
    queryFn: () => projectsService.getCompletionsYearly(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useCompletionTimeStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.completionTimes(userId || 'anonymous'),
    queryFn: () => projectsService.getCompletionTimeStats(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useCollectionStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.collection(userId || 'anonymous'),
    queryFn: () => projectsService.getCollectionStats(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useColoringStatsSummary(
  year = new Date().getFullYear(),
  options: StatsQueryOptions = {}
) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringSummary(userId || 'anonymous', year),
    queryFn: () => ColoringService.getStatsSummary(year),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useColoringCompletionsByMonth(year: number, options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCompletionsByMonth(userId || 'anonymous', year),
    queryFn: () => ColoringService.getCompletionsByMonth(year),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useColoringCompletionsYearly(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCompletionsYearly(userId || 'anonymous'),
    queryFn: () => ColoringService.getCompletionsYearly(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useColoringCompletionTimeStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCompletionTimes(userId || 'anonymous'),
    queryFn: () => ColoringService.getCompletionTimeStats(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useColoringCollectionStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCollection(userId || 'anonymous'),
    queryFn: () => ColoringService.getCollectionStats(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}
