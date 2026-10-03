import { useCallback } from 'react';
import type { ColoringPageCommand } from '@/features/coloring-progress/coloringProgressCommands';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

interface RunColoringPageCommandOptions {
  failureTitle: string;
  onSuccess?: (updatedPage: ColoringPageDTO) => void;
  onFailure?: () => void;
}

export type RunColoringPageCommand = (
  page: ColoringPageDTO | null | undefined,
  command: ColoringPageCommand,
  options: RunColoringPageCommandOptions
) => Promise<ColoringPageDTO | null>;

/**
 * Wraps the command executor with the flow shared by the feature hooks: skip
 * when there is no page, run the command, then sync local state on success or
 * roll it back on failure. Each hook supplies its own onSuccess/onFailure so
 * the optimistic-update logic stays explicit at the call site.
 */
export function useColoringPageCommand(
  commandExecutor: UseColoringPageCommandExecutorResult
): RunColoringPageCommand {
  return useCallback(
    async (page, command, { failureTitle, onSuccess, onFailure }) => {
      if (!page) return null;

      const updatedPage = await commandExecutor.execute(page.id, command, { failureTitle });

      if (updatedPage) {
        onSuccess?.(updatedPage);
      } else {
        onFailure?.();
      }

      return updatedPage;
    },
    [commandExecutor]
  );
}
