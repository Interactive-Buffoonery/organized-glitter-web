import { useCallback } from 'react';
import { useColoringPageCommand } from '@/hooks/coloring/useColoringPageCommand';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type { ColoringPagesStatusOptions as ColoringPageStatus } from '@/types/pocketbase.types';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';

export interface UseColoringPageStatusActionResult {
  isPending: boolean;
  changeStatus: (status: ColoringPageStatus) => Promise<ColoringPageDTO | null>;
}

export function useColoringPageStatusAction(
  page: ColoringPageDTO | null | undefined,
  commandExecutor: UseColoringPageCommandExecutorResult
): UseColoringPageStatusActionResult {
  const runCommand = useColoringPageCommand(commandExecutor);

  const changeStatus = useCallback(
    (status: ColoringPageStatus) => {
      if (!page || status === page.status) return Promise.resolve(null);

      return runCommand(
        page,
        { type: 'set-status', status },
        { failureTitle: 'Status update failed' }
      );
    },
    [page, runCommand]
  );

  return {
    isPending: commandExecutor.isPending,
    changeStatus,
  };
}
