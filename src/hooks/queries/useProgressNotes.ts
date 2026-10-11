import { useQuery } from '@tanstack/react-query';

import { ProgressNotesService } from '@/services/pocketbase/progressNotes.service';
import { ProgressNote } from '@/types/project';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { queryKeys } from './queryKeys';

export function useProgressNotesQuery(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.progressNotes.list(projectId || ''),
    queryFn: async (): Promise<ProgressNote[]> => {
      if (!projectId) return [];

      return ProgressNotesService.listByProject(projectId);
    },
    enabled: !!projectId,
    ...queryFreshness('frequent'),
    placeholderData: () => [],
  });
}
