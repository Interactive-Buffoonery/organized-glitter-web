import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export function useColoringPageProgressNotes(pageId: string | null) {
  return useQuery({
    queryKey: queryKeys.coloring.pageProgressNotes.list(pageId || ''),
    queryFn: async () => {
      if (!pageId) return [];
      return ColoringPageProgressNotesService.listByPage(pageId);
    },
    enabled: Boolean(pageId),
    ...queryFreshness('frequent'),
    placeholderData: () => [],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
