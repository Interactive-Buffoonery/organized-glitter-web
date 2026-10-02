import { useCallback, useLayoutEffect, useRef } from 'react';

import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';

interface EditRecoveryFocusOptions {
  active: boolean;
  identity: string;
  saveButtonId: string;
}

export function useFocusAfterEditRecovery({
  active,
  identity,
  saveButtonId,
}: EditRecoveryFocusOptions) {
  const pending = useRef<{
    generation: number;
    frame: number | null;
    stopWaiting: (() => void) | null;
  }>({ generation: 0, frame: null, stopWaiting: null });

  const cancelPending = useCallback(() => {
    pending.current.generation += 1;
    if (pending.current.frame !== null) cancelAnimationFrame(pending.current.frame);
    pending.current.frame = null;
    pending.current.stopWaiting?.();
    pending.current.stopWaiting = null;
  }, []);

  useLayoutEffect(() => cancelPending, [active, identity, cancelPending]);

  return useCallback(
    async (recover: () => Promise<boolean>): Promise<boolean> => {
      cancelPending();
      const saveTarget = document.getElementById(saveButtonId);
      const generation = pending.current.generation;
      const recovered = await recover();
      if (
        !active ||
        !recovered ||
        generation !== pending.current.generation ||
        !saveTarget?.isConnected
      ) {
        return recovered;
      }

      pending.current.frame = requestAnimationFrame(() => {
        pending.current.frame = null;
        if (generation !== pending.current.generation || !saveTarget.isConnected) return;
        pending.current.stopWaiting = focusWhenRootInteractive(saveTarget);
      });
      return recovered;
    },
    [active, cancelPending, saveButtonId]
  );
}
