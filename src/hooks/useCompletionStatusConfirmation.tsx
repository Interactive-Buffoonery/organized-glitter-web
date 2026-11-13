import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function needsCompletionStatusConfirmation(
  current: string,
  next: string,
  savedDate: string | null | undefined
) {
  return (
    current === 'completed' &&
    Boolean(savedDate) &&
    next !== 'completed' &&
    next !== 'archived' &&
    next !== 'destashed'
  );
}

export function useCompletionStatusConfirmation({
  countsAsFinished = true,
  subject = 'project',
}: { countsAsFinished?: boolean; subject?: 'project' | 'book' | 'page' } = {}) {
  const [open, setOpen] = useState(false);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const finish = useCallback((confirmed: boolean) => {
    resolve.current?.(confirmed);
    resolve.current = null;
    setOpen(false);
  }, []);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    []
  );
  const confirm = useCallback(() => {
    resolve.current?.(false);
    setOpen(true);
    return new Promise<boolean>(done => {
      resolve.current = done;
    });
  }, []);
  const requestChange = useCallback(
    <T,>(
      current: string,
      next: string,
      savedDate: string | null | undefined,
      apply: () => T,
      initialStatus = current
    ): T | Promise<T | false> => {
      if (
        initialStatus === 'completed' &&
        needsCompletionStatusConfirmation(current, next, savedDate)
      ) {
        return confirm().then(confirmed => (confirmed ? apply() : false));
      }
      return apply();
    },
    [confirm]
  );
  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={value => {
        if (!value) finish(false);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={event => {
          if (!triggerRef.current) return;
          event.preventDefault();
          triggerRef.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Change from Completed?</AlertDialogTitle>
          <AlertDialogDescription>
            Did you mean to change this {subject}&apos;s status? The completion date will be kept
            {countsAsFinished ? ` and this ${subject} still counts as finished.` : '.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={() => finish(false)}>
            Keep Completed
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => finish(true)}>
            Change status
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { confirm, requestChange, dialog, triggerRef };
}
