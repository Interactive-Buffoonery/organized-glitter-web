import { queryOptions } from '@tanstack/react-query';
import { isNonRetryableError } from '@/services/errors';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueryUtils');

const standardRetryConfig = (failureCount: number, error: Error): boolean => {
  if (isNonRetryableError(error)) {
    logger.debug('Not retrying non-retryable error', { message: error?.message });
    return false;
  }
  const shouldRetry = failureCount < 2;
  logger.debug('Retry decision', { failureCount, shouldRetry, message: error?.message });
  return shouldRetry;
};

const standardRetryDelay = (attemptIndex: number): number => {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
};

type QueryFreshness = 'standard' | 'frequent' | 'statusCount';

const FRESHNESS_PROFILES: Record<QueryFreshness, { staleTime: number; gcTime: number }> = {
  standard: { staleTime: 10 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  frequent: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  statusCount: { staleTime: 2 * 60 * 1000, gcTime: 5 * 60 * 1000 },
};

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
 * Owns the retry policy, the user-enabled gate, and the freshness profile so
 * callers do not assemble these fields themselves.
 */
export const userScopedQueryOptions = <TQueryKey extends readonly unknown[], TData>({
  queryKey,
  queryFn,
  userId,
  freshness,
}: UserScopedQueryOptionsArgs<TQueryKey, TData>) => {
  const { staleTime, gcTime } = FRESHNESS_PROFILES[freshness];
  return queryOptions({
    queryKey,
    queryFn,
    enabled: !!userId,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: standardRetryConfig,
    retryDelay: standardRetryDelay,
  });
};
