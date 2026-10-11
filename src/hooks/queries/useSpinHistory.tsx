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
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

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
    ...queryFreshness('activity'),
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
  });
};
