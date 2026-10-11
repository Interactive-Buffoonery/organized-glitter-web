/**
 * React Query hook for the total spin count.
 */

import { useQuery } from '@tanstack/react-query';
import { getSpinHistoryCountEnhanced } from '@/services/pocketbase/randomizerService';
import { randomizerQueryKeys } from '@/hooks/queries/useSpinHistory';
import { createLogger } from '@/utils/logger';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

const logger = createLogger('useSpinHistoryCount');

export interface UseSpinHistoryCountParams {
  userId: string | undefined;
  enabled?: boolean;
}

export const useSpinHistoryCount = ({ userId, enabled = true }: UseSpinHistoryCountParams) => {
  return useQuery({
    queryKey: randomizerQueryKeys.count(userId || ''),
    queryFn: async (): Promise<number> => {
      if (!userId) {
        logger.debug('No userId provided, returning zero count');
        return 0;
      }

      logger.debug('Fetching enhanced spin history count with typed service', {
        userId,
      });

      const count = await getSpinHistoryCountEnhanced(userId);

      logger.debug('Enhanced spin history count fetched successfully', {
        userId,
        totalCount: count,
        timestamp: new Date().toISOString(),
      });

      return count;
    },
    enabled: enabled && !!userId,
    ...queryFreshness('activity'),
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (ErrorHandler.isPocketBaseError(error)) {
        const details = (error.details ?? {}) as { canRetry?: boolean };
        const canRetry = details.canRetry ?? error.retryable;
        logger.debug('Service error detected in count query', {
          type: error.type,
          canRetry,
          failureCount,
          userId,
        });
        return canRetry && failureCount < 3;
      }

      const errorMessage = error?.message || '';
      const isClientError =
        errorMessage.includes('400') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('404');

      if (isClientError) {
        logger.debug('Client error detected, not retrying', {
          errorMessage,
          failureCount,
          userId,
        });
        return false;
      }

      const shouldRetry = failureCount < 3;
      logger.debug('Server error detected, retry decision', {
        errorMessage,
        failureCount,
        shouldRetry,
        userId,
      });
      return shouldRetry;
    },
    retryDelay: attemptIndex => {
      const delay = Math.min(1000 * 2 ** attemptIndex, 30000);
      logger.debug('Retrying spin count query', {
        attemptIndex,
        delay,
        userId,
      });
      return delay;
    },
  });
};
