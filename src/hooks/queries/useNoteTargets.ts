import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { OverviewService, type NoteTarget } from '@/services/pocketbase/overview.service';
import type { VerticalToggles } from '@/services/pocketbase/dashboardSettings.service';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

interface UseNoteTargetsOptions {
  verticals?: VerticalToggles;
  searchTerm?: string;
  enabled?: boolean;
}

const MIN_ACTIVE_SEARCH_LENGTH = 2;

export function useNoteTargets(options: UseNoteTargetsOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { verticals, searchTerm, enabled = true } = options;
  const trimmedSearchTerm = searchTerm?.trim() ?? '';
  const activeSearchTerm =
    trimmedSearchTerm.length >= MIN_ACTIVE_SEARCH_LENGTH ? trimmedSearchTerm : '';

  return useQuery<NoteTarget[]>({
    queryKey: queryKeys.noteTargets.list(userId || 'anonymous', {
      searchTerm: activeSearchTerm,
      diamondEnabled: verticals?.diamond_painting,
      coloringEnabled: verticals?.coloring_books,
    }),
    queryFn: () =>
      OverviewService.getNoteTargets(userId!, { searchTerm: activeSearchTerm, verticals }),
    enabled: enabled && !!userId,
    ...queryFreshness('interactive'),
  });
}
