import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useColoringPageCommand } from '@/hooks/coloring/useColoringPageCommand';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

export interface UseColoringPageMediumSelectionResult {
  isPending: boolean;
  selectedMediumIds: string[];
  toggleMedium: (mediumId: string, checked: boolean) => Promise<ColoringPageDTO | null>;
}

export function useColoringPageMediumSelection(
  page: ColoringPageDTO | null | undefined,
  commandExecutor: UseColoringPageCommandExecutorResult
): UseColoringPageMediumSelectionResult {
  const runCommand = useColoringPageCommand(commandExecutor);
  const [selectedMediumIds, setSelectedMediumIds] = useState<string[]>([]);
  const selectedMediumIdsRef = useRef<string[]>([]);
  const pageMediumIds = useMemo(() => page?.mediumIds ?? [], [page?.mediumIds]);

  useEffect(() => {
    selectedMediumIdsRef.current = pageMediumIds;
    setSelectedMediumIds(pageMediumIds);
  }, [page?.id, pageMediumIds]);

  const toggleMedium = useCallback(
    (mediumId: string, checked: boolean) => {
      if (!page) return Promise.resolve(null);

      const currentMediumIds = selectedMediumIdsRef.current;
      const nextMediumIds = checked
        ? Array.from(new Set([...currentMediumIds, mediumId]))
        : currentMediumIds.filter(id => id !== mediumId);

      selectedMediumIdsRef.current = nextMediumIds;
      setSelectedMediumIds(nextMediumIds);

      return runCommand(
        page,
        { type: 'set-mediums', mediumIds: nextMediumIds },
        {
          failureTitle: 'Mediums did not save',
          onFailure: () => {
            selectedMediumIdsRef.current = page.mediumIds;
            setSelectedMediumIds(page.mediumIds);
          },
        }
      );
    },
    [page, runCommand]
  );

  return {
    isPending: commandExecutor.isPending,
    selectedMediumIds,
    toggleMedium,
  };
}
