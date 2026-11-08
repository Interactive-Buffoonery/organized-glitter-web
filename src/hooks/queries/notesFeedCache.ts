import type { QueryClient } from '@tanstack/react-query';

import { queryKeys, type NotesFeedQueryParams } from '@/hooks/queries/queryKeys';

type NotesFeedInvalidationOptions = NotesFeedQueryParams & {
  userId?: string;
};

export const invalidateNotesFeedQueries = (
  queryClient: QueryClient,
  options: NotesFeedInvalidationOptions = {}
) => {
  const { userId, ...params } = options;

  if (userId) {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.notesFeed.list(userId, params) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notesFeed.streak(userId) }),
    ]);
  }

  return queryClient.invalidateQueries({
    queryKey: queryKeys.notesFeed.all,
  });
};
