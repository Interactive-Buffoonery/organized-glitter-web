import { useQuery } from '@tanstack/react-query';
import { TagService } from '@/services/pocketbase/tags.service';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { useAuth } from '@/hooks/useAuth';
import { isNonRetryableError } from '@/services/errors';
import { createLogger } from '@/utils/logger';
import { queryKeys } from './queryKeys';

const logger = createLogger('useTagStats');

export interface TagStatsResult {
  data: Record<string, number>;
  isLoading: boolean;
  error: Error | null;
  isSuccess: boolean;
  refetch: () => void;
}

/**
 * Custom hook for fetching tag statistics (project counts) with optimized caching
 *
 * Features:
 * - 5-minute cache for better performance
 * - Automatic retry on network errors
 * - Optimistic updates support
 * - Request deduplication
 */
export function useTagStats(tagIds: string[]): TagStatsResult {
  const { user } = useAuth();

  const { data, error, isLoading, isSuccess, refetch } = useQuery({
    queryKey: queryKeys.tags.stat(user?.id || '', tagIds),
    queryFn: async () => {
      logger.debug('Fetching stats for tags', { tagCount: tagIds.length });
      const result = await TagService.getBulkTagStats(tagIds);

      if (result.status === 'error') {
        throw result.error;
      }

      return result.data;
    },
    enabled: !!user?.id && tagIds.length > 0,
    ...queryFreshness('frequent'),
    retry: (failureCount, error: Error) => {
      // Don't retry on client errors (4xx) - likely auth or permission issues
      if (isNonRetryableError(error)) {
        return false;
      }
      // Retry up to 2 times for network errors
      return failureCount < 2;
    },
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch if we have fresh data
  });

  return {
    data: data || {},
    isLoading,
    error: error as Error | null,
    isSuccess,
    refetch,
  };
}
