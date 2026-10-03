import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';

export function useColoringPageProgressNotes(pageId: string | null) {
  return useQuery({
    queryKey: queryKeys.coloring.pageProgressNotes.list(pageId || ''),
    queryFn: async () => {
      if (!pageId) return [];
      return ColoringPageProgressNotesService.listByPage(pageId);
    },
    enabled: Boolean(pageId),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    placeholderData: () => [],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
