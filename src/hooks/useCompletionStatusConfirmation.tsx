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

const POPUP_SELECTOR = '[role="listbox"], [data-radix-popper-content-wrapper] [role="dialog"]';

function findReturnFocusTarget() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    const popup = active.closest(POPUP_SELECTOR);
    if (!popup) return active;
    const triggers = document.querySelectorAll<HTMLElement>('[aria-controls]');
    const trigger = Array.from(triggers).find(
      element => element.getAttribute('aria-controls') === popup.id
    );
    return trigger ?? null;
  }
  // Safari does not focus clicked buttons, so only an unambiguous open trigger is safe to use.
  const expanded = document.querySelectorAll<HTMLElement>(
    '[aria-haspopup][aria-expanded="true"], [role="combobox"][aria-expanded="true"]'
  );
  return expanded.length === 1 ? expanded[0] : null;
}

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
    const trigger = findReturnFocusTarget();
    returnFocusTo.current = trigger;
    setOpen(true);
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
