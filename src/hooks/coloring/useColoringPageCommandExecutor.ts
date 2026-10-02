import { useCallback } from 'react';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import {
  useUpdateColoringPage,
  type ColoringPageCommand,
} from '@/hooks/mutations/coloring/useUpdateColoringPage';
import { notify } from '@/lib/notifications';

interface ColoringPageCommandFailureOptions {
  failureTitle: string;
  fallbackDescription?: string;
}

export interface UseColoringPageCommandExecutorResult {
  isPending: boolean;
  execute: (
    pageId: string,
    command: ColoringPageCommand,
    options: ColoringPageCommandFailureOptions
  ) => Promise<ColoringPageDTO | null>;
}

export function useColoringPageCommandExecutor(): UseColoringPageCommandExecutorResult {
  const { mutateAsync, isPending } = useUpdateColoringPage();

  const execute = useCallback(
    async (
      pageId: string,
      command: ColoringPageCommand,
      { failureTitle, fallbackDescription = 'Please try again.' }: ColoringPageCommandFailureOptions
    ) => {
      try {
        return await mutateAsync({ pageId, command });
      } catch (error) {
        notify({
          kind: 'error',
          title: failureTitle,
          description: error instanceof Error ? error.message : fallbackDescription,
        });
        return null;
      }
    },
    [mutateAsync]
  );

  return { isPending, execute };
}
