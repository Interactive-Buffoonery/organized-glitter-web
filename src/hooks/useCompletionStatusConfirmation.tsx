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

export function useCompletionStatusConfirmation({ countsAsFinished = true } = {}) {
  const [open, setOpen] = useState(false);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
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
    const openSelect = document.querySelector<HTMLElement>(
      '[role="combobox"][aria-expanded="true"]'
    );
    returnFocusTo.current = openSelect;
    const listboxId = openSelect?.getAttribute('aria-controls');
    // Select and AlertDialog resolve different Radix layer versions. Opening while the Select is
    // still mounted makes the dialog restore the Select's pointer-events lock when it closes.
    const openAfterSelectCloses = () => {
      if (listboxId && document.getElementById(listboxId)) {
        requestAnimationFrame(openAfterSelectCloses);
        return;
      }
      setOpen(true);
    };
    requestAnimationFrame(openAfterSelectCloses);
    return new Promise<boolean>(done => {
      resolve.current = done;
    });
  }, []);
  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={value => {
        if (!value) finish(false);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={event => {
          if (!returnFocusTo.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Change from Completed?</AlertDialogTitle>
          <AlertDialogDescription>
            Did you mean to change this status? The completion date is kept
            {countsAsFinished ? ' and this still counts as finished.' : '.'}
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
  return { confirm, dialog };
}
