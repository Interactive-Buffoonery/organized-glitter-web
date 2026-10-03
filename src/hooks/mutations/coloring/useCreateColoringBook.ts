import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ColoringService,
  type CreateColoringBookInput,
  type SaveBookWithTagsResult,
} from '@/services/pocketbase/coloring.service';
import { cacheCreatedColoringBook } from '@/hooks/mutations/coloring/coloringMutationCache';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getColoringBookAnalyticsProperties } from '@/services/coloring-analytics';
import { trackGrowthFunnelMilestone } from '@/services/growth-funnel-analytics';
import { useAuth } from '@/hooks/useAuth';
import { createLogger } from '@/utils/logger';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

const logger = createLogger('useCreateColoringBook');

export interface CreateColoringBookVariables {
  input: CreateColoringBookInput;
  tagIds: string[];
  onConfirmedSave?: () => void;
}

export function useCreateColoringBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation<SaveBookWithTagsResult, Error, CreateColoringBookVariables>({
    mutationFn: ({ input, tagIds, onConfirmedSave }) =>
      onConfirmedSave
        ? ColoringService.createBookWithTags(input, tagIds, onConfirmedSave)
        : ColoringService.createBookWithTags(input, tagIds),
    onSuccess: ({ book }) => {
      runPostWriteEffect(logger, 'Coloring book Stats refresh failed after creation', () => {
        invalidateStatsQueries(queryClient, 'coloring');
      });
      cacheCreatedColoringBook(queryClient, book);

      runPostWriteEffect(logger, 'Coloring book create analytics failed after creation', () => {
        capture(
          AnalyticsEvent.COLORING_BOOK_CREATED,
          getColoringBookAnalyticsProperties(book, { surface: 'new_coloring_book' })
        );
      });
      runPostWriteEffect(logger, 'Coloring book growth analytics failed after creation', () => {
        trackGrowthFunnelMilestone({
          userId: user?.id ?? book.userId,
          event: AnalyticsEvent.FIRST_COLORING_BOOK_CREATED,
          properties: {
            craft: 'coloring',
            entity_type: 'coloring_book',
            source_surface: 'new_coloring_book',
            total_pages_bucket: getColoringBookAnalyticsProperties(book).total_pages_bucket,
            is_mystery: book.isMystery,
          },
          activationSignal: 'item_created',
        });
      });
    },
  });
}
