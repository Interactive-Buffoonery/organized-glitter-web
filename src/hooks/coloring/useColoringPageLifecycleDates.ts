import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getColoringPageLifecycleDateRangeError,
  type ColoringPageCommand,
} from '@/features/coloring-progress/coloringProgressCommands';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';
import { notify } from '@/lib/notifications';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';

type LifecycleDateField = 'startedAt' | 'completedAt';

function formatColoringPageDateInputValue(value: string | undefined, userTimezone: string) {
  if (!value) return '';
  const formatted = formatDateInUserTimezone(value, userTimezone, 'yyyy-MM-dd');
  return formatted || value.slice(0, 10);
}

export interface UseColoringPageLifecycleDatesResult {
  isPending: boolean;
  startedAtValue: string;
  completedAtValue: string;
  startedAtDraft: string;
  completedAtDraft: string;
  setStartedAtDraft: (value: string) => void;
  setCompletedAtDraft: (value: string) => void;
  saveStartedAt: () => Promise<ColoringPageDTO | null>;
  saveCompletedAt: () => Promise<ColoringPageDTO | null>;
  clearStartedAt: () => Promise<ColoringPageDTO | null>;
  clearCompletedAt: () => Promise<ColoringPageDTO | null>;
}

export function useColoringPageLifecycleDates(
  page: ColoringPageDTO | null | undefined,
  userTimezone: string,
  commandExecutor: UseColoringPageCommandExecutorResult
): UseColoringPageLifecycleDatesResult {
  const [startedAtDraft, setStartedAtDraft] = useState('');
  const [completedAtDraft, setCompletedAtDraft] = useState('');
  const startedAtDraftRef = useRef('');
  const completedAtDraftRef = useRef('');

  const startedAtValue = formatColoringPageDateInputValue(page?.startedAt, userTimezone);
  const completedAtValue = formatColoringPageDateInputValue(page?.completedAt, userTimezone);

  useEffect(() => {
    startedAtDraftRef.current = startedAtValue;
    setStartedAtDraft(startedAtValue);
  }, [page?.id, startedAtValue, userTimezone]);

  useEffect(() => {
    completedAtDraftRef.current = completedAtValue;
    setCompletedAtDraft(completedAtValue);
  }, [page?.id, completedAtValue, userTimezone]);

  const setStartedAtDraftValue = useCallback((value: string) => {
    startedAtDraftRef.current = value;
    setStartedAtDraft(value);
  }, []);

  const setCompletedAtDraftValue = useCallback((value: string) => {
    completedAtDraftRef.current = value;
    setCompletedAtDraft(value);
  }, []);

  const saveLifecycleDate = useCallback(
    async (field: LifecycleDateField, nextValue: string) => {
      if (!page) return null;

      const nextStartedAt = field === 'startedAt' ? nextValue : startedAtDraftRef.current;
      const nextCompletedAt = field === 'completedAt' ? nextValue : completedAtDraftRef.current;
      const rangeError = getColoringPageLifecycleDateRangeError(nextStartedAt, nextCompletedAt);
      if (rangeError) {
        notify({
          kind: 'error',
          title: 'Date range is not possible',
          description: rangeError,
        });
        return null;
      }

      const command: ColoringPageCommand =
        field === 'startedAt'
          ? { type: 'set-started-date', startedAt: nextValue }
          : { type: 'set-completed-date', completedAt: nextValue };

      return commandExecutor.execute(page.id, command, { failureTitle: 'Date did not save' });
    },
    [commandExecutor, page]
  );

  const saveStartedAt = useCallback(
    () => saveLifecycleDate('startedAt', startedAtDraftRef.current),
    [saveLifecycleDate]
  );

  const saveCompletedAt = useCallback(
    () => saveLifecycleDate('completedAt', completedAtDraftRef.current),
    [saveLifecycleDate]
  );

  const clearStartedAt = useCallback(() => {
    setStartedAtDraftValue('');
    return saveLifecycleDate('startedAt', '');
  }, [saveLifecycleDate, setStartedAtDraftValue]);

  const clearCompletedAt = useCallback(() => {
    setCompletedAtDraftValue('');
    return saveLifecycleDate('completedAt', '');
  }, [saveLifecycleDate, setCompletedAtDraftValue]);

  return {
    isPending: commandExecutor.isPending,
    startedAtValue,
    completedAtValue,
    startedAtDraft,
    completedAtDraft,
    setStartedAtDraft: setStartedAtDraftValue,
    setCompletedAtDraft: setCompletedAtDraftValue,
    saveStartedAt,
    saveCompletedAt,
    clearStartedAt,
    clearCompletedAt,
  };
}
