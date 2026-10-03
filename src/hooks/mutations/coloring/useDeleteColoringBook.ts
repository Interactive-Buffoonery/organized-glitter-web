import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ColoringService, type ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import {
  clearDeletedColoringBook,
  getCachedColoringBook,
} from '@/hooks/mutations/coloring/coloringMutationCache';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getColoringBookAnalyticsProperties } from '@/services/coloring-analytics';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useDeleteColoringBook');

interface Context {
  previousBook?: ColoringBookDTO;
}

export function useDeleteColoringBook() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, Context>({
    mutationFn: (bookId: string) => ColoringService.deleteBook(bookId),
    onMutate: bookId => {
      const previousBook = getCachedColoringBook(queryClient, bookId);
      return { previousBook };
    },
    onSuccess: async (_data, bookId) => {
      runPostWriteEffect(logger, 'Coloring book Stats refresh failed after delete', () => {
        invalidateStatsQueries(queryClient, 'coloring');
      });
      await clearDeletedColoringBook(queryClient, bookId);
    },
    onSettled: (_data, error, _bookId, context) => {
      if (error) return;
      runPostWriteEffect(logger, 'Coloring book analytics failed after delete', () => {
        capture(
          AnalyticsEvent.COLORING_BOOK_DELETED,
          context?.previousBook
            ? getColoringBookAnalyticsProperties(context.previousBook, {
                surface: 'coloring_book_detail',
              })
            : { craft: 'coloring', surface: 'coloring_book_detail', had_cached_book: false }
        );
      });
    },
  });
}
