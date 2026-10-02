import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookIllustratorsService } from '@/services/pocketbase/bookIllustrators.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';

export function useCreateBookIllustrator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => BookIllustratorsService.createIfNotExists(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.illustrators.all });
      capture(AnalyticsEvent.BOOK_ILLUSTRATOR_CREATED, {
        craft: 'coloring',
        surface: 'coloring_book_form',
      });
    },
  });
}
