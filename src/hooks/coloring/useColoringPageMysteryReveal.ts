import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useColoringPageCommand } from '@/hooks/coloring/useColoringPageCommand';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

export interface UseColoringPageMysteryRevealResult {
  isPending: boolean;
  isEditingReveal: boolean;
  revealedSubject: string;
  setRevealedSubject: (revealedSubject: string) => void;
  startRevealEditing: () => void;
  cancelRevealEditing: () => void;
  submitReveal: () => Promise<ColoringPageDTO | null>;
  clearReveal: () => Promise<ColoringPageDTO | null>;
}

export function useColoringPageMysteryReveal(
  page: ColoringPageDTO | null | undefined,
  commandExecutor: UseColoringPageCommandExecutorResult
): UseColoringPageMysteryRevealResult {
  const runCommand = useColoringPageCommand(commandExecutor);
  const [isEditingReveal, setIsEditingReveal] = useState(false);
  const [revealedSubject, setRevealedSubject] = useState('');
  const revealedSubjectRef = useRef('');
  const [prevPageId, setPrevPageId] = useState<string | undefined>(page?.id);

  if (prevPageId !== page?.id) {
    const nextRevealedSubject = page?.revealedSubject ?? '';
    setPrevPageId(page?.id);
    setIsEditingReveal(false);
    setRevealedSubject(nextRevealedSubject);
  }

  useLayoutEffect(() => {
    revealedSubjectRef.current = revealedSubject;
  }, [revealedSubject]);

  const setRevealedSubjectValue = useCallback((value: string) => {
    revealedSubjectRef.current = value;
    setRevealedSubject(value);
  }, []);

  const startRevealEditing = useCallback(() => {
    setRevealedSubjectValue(page?.revealedSubject ?? '');
    setIsEditingReveal(true);
  }, [page?.revealedSubject, setRevealedSubjectValue]);

  const cancelRevealEditing = useCallback(() => {
    setRevealedSubjectValue(page?.revealedSubject ?? '');
    setIsEditingReveal(false);
  }, [page?.revealedSubject, setRevealedSubjectValue]);

  const submitReveal = useCallback(() => {
    const trimmedSubject = revealedSubjectRef.current.trim();
    if (!trimmedSubject) return Promise.resolve(null);

    return runCommand(
      page,
      {
        type: 'reveal-mystery',
        revealedSubject: trimmedSubject,
        revealedAt: new Date().toISOString(),
      },
      { failureTitle: 'Reveal failed', onSuccess: () => setIsEditingReveal(false) }
    );
  }, [page, runCommand]);

  const clearReveal = useCallback(() => {
    return runCommand(
      page,
      { type: 'clear-mystery-reveal' },
      {
        failureTitle: 'Could not mark unrevealed',
        onSuccess: () => {
          setIsEditingReveal(false);
          setRevealedSubjectValue('');
        },
      }
    );
  }, [page, runCommand, setRevealedSubjectValue]);

  return {
    isPending: commandExecutor.isPending,
    isEditingReveal,
    revealedSubject,
    setRevealedSubject: setRevealedSubjectValue,
    startRevealEditing,
    cancelRevealEditing,
    submitReveal,
    clearReveal,
  };
}
