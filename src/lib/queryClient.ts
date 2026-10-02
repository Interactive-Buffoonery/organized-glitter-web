import { QueryClient } from '@tanstack/react-query';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import { createLogger } from '@/utils/logger';

// Define proper error interface
interface ErrorWithStatus {
  status: number;
  message?: string;
}

const logger = createLogger('QueryClient');

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Enhanced retry logic with PocketBase 404 handling
      retry: (failureCount, error) => {
        // Never retry cancelled/aborted requests; the cancellation was
        // intentional (PocketBase requestKey-based auto-cancel) and a
        // replacement request is already in flight.
        if (ErrorHandler.isCancelledError(error)) {
          return false;
        }

        // DIAGNOSTIC: Log retry attempt details for debugging
        logger.debug('React Query retry attempt', {
          failureCount,
          errorType: error?.constructor?.name,
          errorMessage: error?.message,
          errorStatus:
            error && typeof error === 'object' && 'status' in error
              ? (error as ErrorWithStatus).status
              : undefined,
        });

        // Never retry more than 2 times
        if (failureCount >= 2) {
          logger.debug('Max retry attempts reached, stopping retries');
          return false;
        }

        // Handle PocketBase 404 errors gracefully (simplified without query object)
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as ErrorWithStatus).status;

          if (status === 404) {
            logger.debug('404 error detected - not retrying');
            return false;
          }

          if (status >= 400 && status < 500) {
            logger.warn(`Client error ${status} - not retrying`);
            return false;
          }

          if (status >= 500) {
            logger.error(`Server error ${status} - allowing retry`);
            return true;
          }
        }

        // Handle network errors
        if (error instanceof Error) {
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            logger.warn(`Network error - allowing retry: ${error.message}`);
            return true;
          }
        }

        // Default: allow retry for unknown errors
        logger.error(`Unknown error - allowing retry: ${error}`);
        return true;
      },
      // Retry delay that increases exponentially
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Only refetch on window focus if data is stale (reduces unnecessary API calls)
      refetchOnWindowFocus: true,
      // Only refetch on reconnect if data is stale
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// Override cache settings for image-related queries
queryClient.setQueryDefaults(['optimized-image'], {
  staleTime: 30 * 60 * 1000, // 30 minutes for optimized images
  gcTime: 60 * 60 * 1000, // 1 hour retention for images
  refetchOnWindowFocus: false, // Images don't change frequently
  refetchOnReconnect: false, // Avoid unnecessary image refetches
});

queryClient.setQueryDefaults(['progressive-image'], {
  staleTime: 30 * 60 * 1000, // 30 minutes for progressive images
  gcTime: 60 * 60 * 1000, // 1 hour retention for images
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
