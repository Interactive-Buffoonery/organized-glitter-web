/**
 * React Query hook for the total spin count.
 */

import { useQuery } from '@tanstack/react-query';
import { getSpinHistoryCountEnhanced } from '@/services/pocketbase/randomizerService';
import { randomizerQueryKeys } from '@/hooks/queries/useSpinHistory';
import { createLogger } from '@/utils/logger';
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
  });
};
