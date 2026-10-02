import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { OverviewService, type NoteTarget } from '@/services/pocketbase/overview.service';

interface UseBookNoteTargetsOptions {
  enabled?: boolean;
}

export function useBookNoteTargets(
  bookId: string | undefined,
  options: UseBookNoteTargetsOptions = {}
) {
  const { user } = useAuth();
  const userId = user?.id;
  const { enabled = true } = options;

  return useQuery<NoteTarget[]>({
    queryKey: queryKeys.noteTargets.pagesForBook(userId || 'anonymous', bookId || 'none'),
    queryFn: () => OverviewService.getPagesForBook(userId!, bookId!),
    enabled: enabled && !!userId && !!bookId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
