import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { queryKeys } from './queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

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
    ...queryFreshness('interactive'),
  });
}

export function useCompletionsByMonth(year: number, options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.completionsByMonth(userId || 'anonymous', year),
    queryFn: () => projectsService.getCompletionsByMonth(year),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}

export function useCompletionsYearly(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.completionsYearly(userId || 'anonymous'),
    queryFn: () => projectsService.getCompletionsYearly(),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}

export function useCompletionTimeStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.completionTimes(userId || 'anonymous'),
    queryFn: () => projectsService.getCompletionTimeStats(),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}

export function useCollectionStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.collection(userId || 'anonymous'),
    queryFn: () => projectsService.getCollectionStats(),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
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
    ...queryFreshness('interactive'),
  });
}

export function useColoringCompletionsByMonth(year: number, options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCompletionsByMonth(userId || 'anonymous', year),
    queryFn: () => ColoringService.getCompletionsByMonth(year),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}

export function useColoringCompletionsYearly(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCompletionsYearly(userId || 'anonymous'),
    queryFn: () => ColoringService.getCompletionsYearly(),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}

export function useColoringCompletionTimeStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCompletionTimes(userId || 'anonymous'),
    queryFn: () => ColoringService.getCompletionTimeStats(),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}

export function useColoringCollectionStats(options: StatsQueryOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.coloringCollection(userId || 'anonymous'),
    queryFn: () => ColoringService.getCollectionStats(),
    enabled: !!userId && (options.enabled ?? true),
    ...queryFreshness('interactive'),
  });
}
