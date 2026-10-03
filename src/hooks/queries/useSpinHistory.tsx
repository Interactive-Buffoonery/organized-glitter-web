/**
 * React Query hook for randomizer spin history.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getSpinHistoryEnhanced,
  type RandomizerSpinExpand,
} from '@/services/pocketbase/randomizerService';
import type { RandomizerSpinsResponse } from '@/types/pocketbase.types';
import type { RandomizerSpinMetadata } from '@/types/randomizer';
import { createLogger } from '@/utils/logger';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';

const logger = createLogger('useSpinHistory');

/**
 * Optimized query keys for randomizer operations with type safety
 */
export const randomizerQueryKeys = {
  all: ['randomizer'] as const,
  historyLists: (userId: string) => [...randomizerQueryKeys.all, 'history', userId] as const,
  history: (userId: string, limit: number = 8) =>
    [...randomizerQueryKeys.all, 'history', userId, limit] as const,
  count: (userId: string) => [...randomizerQueryKeys.all, 'count', userId] as const,
} as const;

export interface UseSpinHistoryParams {
  userId: string | undefined;
  limit?: number;
  enabled?: boolean;
}

export type EnhancedSpinRecord = RandomizerSpinsResponse<
  RandomizerSpinMetadata | null,
  string[],
  RandomizerSpinExpand
>;

export const useSpinHistory = ({ userId, limit = 8, enabled = true }: UseSpinHistoryParams) => {
  return useQuery({
    queryKey: randomizerQueryKeys.history(userId || '', limit),
    queryFn: async (): Promise<EnhancedSpinRecord[]> => {
      if (!userId) {
        logger.debug('No userId provided, returning empty history');
        return [];
      }

      logger.debug('Fetching enhanced spin history', {
        userId,
        limit,
      });

      const history = await getSpinHistoryEnhanced(userId, limit);

      logger.debug('Enhanced spin history fetched', {
        userId,
        recordCount: history.length,
      });

      return history;
    },
    enabled: enabled && !!userId,
    staleTime: 30 * 1000, // 30 seconds - relatively fresh for user activity
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    retry: (failureCount, error) => {
      if (ErrorHandler.isPocketBaseError(error)) {
        const details = (error.details ?? {}) as { canRetry?: boolean };
        const canRetry = details.canRetry ?? error.retryable;
        logger.debug('Service error detected', {
          type: error.type,
          canRetry,
        });
        return canRetry && failureCount < 2;
      }

      const errorMessage = error?.message || '';
      const isClientError =
        errorMessage.includes('400') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('404');

      if (isClientError) return false;
      return failureCount < 2;
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
