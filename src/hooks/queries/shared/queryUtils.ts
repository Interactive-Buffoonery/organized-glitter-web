import { queryOptions } from '@tanstack/react-query';
import { createLogger } from '@/utils/logger';

export type QueryFreshness = 'standard' | 'frequent' | 'interactive' | 'activity';

const FRESHNESS_PROFILES: Record<QueryFreshness, { staleTime: number; gcTime: number }> = {
  standard: { staleTime: 10 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  frequent: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  interactive: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  activity: { staleTime: 30 * 1000, gcTime: 5 * 60 * 1000 },
};

/**
 * Cache timing for a named freshness profile. Spread into query options so
 * every query picks a profile instead of choosing its own stale and gc times.
 */
export const queryFreshness = (profile: QueryFreshness) => ({ ...FRESHNESS_PROFILES[profile] });

export const createQueryTimer = (hookName: string, operation: string) => {
  const startTime = performance.now();
  const queryLogger = createLogger(hookName);

  return {
    stop: (context?: Record<string, unknown>) => {
      const duration = performance.now() - startTime;
      queryLogger.debug(`${operation} completed in ${Math.round(duration)}ms`, context);
      return duration;
    },
  };
};

interface UserScopedQueryOptionsArgs<TQueryKey extends readonly unknown[], TData> {
  queryKey: TQueryKey;
  queryFn: () => Promise<TData>;
  userId: string | undefined;
  freshness: QueryFreshness;
}

/**
 * Builds a queryOptions object for queries scoped to an authenticated user.
 * Owns the user-enabled gate and the freshness profile so callers do not
 * assemble these fields themselves. Retry comes from the query client.
 */
export const userScopedQueryOptions = <TQueryKey extends readonly unknown[], TData>({
  queryKey,
  queryFn,
  userId,
  freshness,
}: UserScopedQueryOptionsArgs<TQueryKey, TData>) => {
  return queryOptions({
    queryKey,
    queryFn,
    enabled: !!userId,
    ...queryFreshness(freshness),
  });
};
