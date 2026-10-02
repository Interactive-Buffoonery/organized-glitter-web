import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

interface DirtyFormGuardOptions {
  isDirty: boolean;
  isSaving?: boolean;
  onDiscard: () => void;
}

const DISCARD_MESSAGE = 'Discard your unsaved changes?';

export function useDirtyFormGuard({ isDirty, isSaving = false, onDiscard }: DirtyFormGuardOptions) {
  const allowLeaveRef = useRef(false);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (isDirty || isSaving) &&
      !allowLeaveRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash)
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (isSaving) {
      blocker.reset();
      return;
    }
    if (allowLeaveRef.current) {
      blocker.proceed();
      return;
    }
    if (window.confirm(DISCARD_MESSAGE)) {
      onDiscardRef.current();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, isSaving]);

  useEffect(() => {
    if (!isDirty && !isSaving) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty, isSaving]);

  const allowLeave = useCallback(() => {
    allowLeaveRef.current = true;
  }, []);

  const markChanged = useCallback(() => {
    allowLeaveRef.current = false;
  }, []);

  const confirmDiscard = useCallback(
    (leave: () => void) => {
      if (isSaving) return false;
      if (isDirty && !window.confirm(DISCARD_MESSAGE)) return false;
      if (isDirty) onDiscardRef.current();
      allowLeaveRef.current = true;
      leave();
      return true;
    },
    [isDirty, isSaving]
  );

  return { allowLeave, confirmDiscard, markChanged };
}
