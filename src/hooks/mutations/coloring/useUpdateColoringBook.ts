import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ColoringBookDTO,
  ColoringService,
  type SaveBookWithTagsResult,
  type UpdateColoringBookInput,
} from '@/services/pocketbase/coloring.service';
import {
  cacheUpdatedColoringBook,
  getCachedColoringBook,
  refreshFailedColoringBookUpdate,
} from '@/hooks/mutations/coloring/coloringMutationCache';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getColoringBookAnalyticsProperties } from '@/services/coloring-analytics';
import { createLogger } from '@/utils/logger';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

const logger = createLogger('useUpdateColoringBook');

export interface UpdateColoringBookVariables {
  bookId: string;
  patch: UpdateColoringBookInput;
  tagIds?: string[];
  onConfirmedSave?: () => void;
  expectedRevision?: number;
}

interface Context {
  previousBook?: ColoringBookDTO;
}

export function useUpdateColoringBook() {
  const queryClient = useQueryClient();
  return useMutation<SaveBookWithTagsResult, Error, UpdateColoringBookVariables, Context>({
    mutationFn: ({ bookId, patch, tagIds, onConfirmedSave, expectedRevision }) => {
      if (expectedRevision !== undefined) {
        return ColoringService.updateBookWithTags(
          bookId,
          patch,
          tagIds,
          onConfirmedSave,
          expectedRevision
        );
      }
      return onConfirmedSave
        ? ColoringService.updateBookWithTags(bookId, patch, tagIds, onConfirmedSave)
        : ColoringService.updateBookWithTags(bookId, patch, tagIds);
    },
    onMutate: ({ bookId }) => {
      const previousBook = getCachedColoringBook(queryClient, bookId);
      return { previousBook };
    },
    onSuccess: ({ book }) => {
      runPostWriteEffect(logger, 'Coloring book Stats refresh failed after update', () => {
        invalidateStatsQueries(queryClient, 'coloring');
      });
      cacheUpdatedColoringBook(queryClient, book);
    },
    onError: (_error, { bookId }) => {
      refreshFailedColoringBookUpdate(queryClient, bookId);
    },
    onSettled: (data, error, variables, context) => {
      if (!data || error) return;

      const previousStatus = context?.previousBook?.status;
      runPostWriteEffect(logger, 'Coloring book update analytics failed after save', () => {
        capture(
          AnalyticsEvent.COLORING_BOOK_UPDATED,
          getColoringBookAnalyticsProperties(data.book, {
            surface: 'coloring_book_detail',
            changed_field_count: Object.keys(variables.patch).length,
          })
        );
      });

      if (variables.patch.status && variables.patch.status !== previousStatus) {
        runPostWriteEffect(logger, 'Coloring book status analytics failed after save', () => {
          capture(
            AnalyticsEvent.COLORING_BOOK_STATUS_CHANGED,
            getColoringBookAnalyticsProperties(data.book, {
              surface: 'coloring_book_detail',
              previous_status: previousStatus,
              status: variables.patch.status,
            })
          );
        });
      }
    },
  });
}
