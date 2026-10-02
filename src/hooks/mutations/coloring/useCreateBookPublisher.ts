import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookPublishersService } from '@/services/pocketbase/bookPublishers.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';

export function useCreateBookPublisher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; website_url?: string }) =>
      BookPublishersService.createIfNotExists(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.publishers.all });
      capture(AnalyticsEvent.BOOK_PUBLISHER_CREATED, {
        craft: 'coloring',
        surface: 'coloring_book_form',
        has_website_url: Boolean(variables.website_url),
      });
    },
  });
}
