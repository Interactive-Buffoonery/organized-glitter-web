import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { createLogger } from '@/utils/logger';

const logger = createLogger('statsInvalidation');

const diamondProjections = new Set([
  'overview',
  'availableYears',
  'summary',
  'completionsByMonth',
  'completionsYearly',
  'completionTimes',
  'collection',
]);

const coloringProjections = new Set([
  'overview',
  'coloringSummary',
  'coloringCompletionsByMonth',
  'coloringCompletionsYearly',
  'coloringCompletionTimes',
  'coloringCollection',
]);
const overviewProjection = new Set(['overview']);

export function invalidateStatsQueries(
  queryClient: QueryClient,
  craft: 'diamond' | 'coloring' | 'overview'
): void {
  const projections =
    craft === 'diamond'
      ? diamondProjections
      : craft === 'coloring'
        ? coloringProjections
        : overviewProjection;

  void queryClient
    .invalidateQueries({
      queryKey: queryKeys.stats.all,
      predicate: query => {
        const projection = query.queryKey[1];
        return typeof projection === 'string' && projections.has(projection);
      },
    })
    .catch(error => logger.warn('Could not refresh Stats after a successful write', error));
}
