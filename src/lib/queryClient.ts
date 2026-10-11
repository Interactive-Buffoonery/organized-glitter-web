import { QueryClient } from '@tanstack/react-query';
import { isNonRetryableError } from '@/services/errors';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueryClient');

/**
 * Shared retry policy for every query. Cancelled requests and errors the
 * classifier marks non-retryable (4xx, validation, unclassified) stop at once;
 * network failures, 429, and 5xx retry twice with backoff.
 */
export const defaultQueryRetry = (failureCount: number, error: unknown): boolean => {
  if (isNonRetryableError(error)) {
    logger.debug('Not retrying non-retryable error', { failureCount, error });
    return false;
  }
  return failureCount < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      retry: defaultQueryRetry,
      // Retry delay that increases exponentially
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Focus and reconnect refetch only queries that are already stale.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
