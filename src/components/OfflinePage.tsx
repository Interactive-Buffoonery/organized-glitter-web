/**
 * Offline page component that displays when user is offline
 * @author @serabi
 * @created 2025-08-02
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hideOthers } from 'aria-hidden';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const getRecoveryPortalContainer = () => {
  const openDialogs = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    )
  ).filter(dialog => !dialog.hasAttribute('data-connection-recovery'));

  return openDialogs.at(-1) ?? document.body;
};

const isolateRecoveryDialog = (dialog: HTMLDialogElement) => {
  const restoredElements: Array<{
    element: HTMLElement;
    inert: boolean;
  }> = [];
  const restoreAriaIsolation = hideOthers(dialog);
  let branch: HTMLElement = dialog;

  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (!(sibling instanceof HTMLElement) || sibling === branch) {
        continue;
      }

      restoredElements.push({
        element: sibling,
        inert: sibling.inert,
      });
      sibling.inert = true;
    }

    if (branch.parentElement === document.body) {
      break;
    }
    branch = branch.parentElement;
  }

  return () => {
    restoreAriaIsolation();
    for (const { element, inert } of restoredElements) {
      if (element.inert) {
        element.inert = inert;
      }
    }
  };
};

interface OfflinePageProps {
  onCheckConnection: () => void;
  isChecking: boolean;
  error: string | null;
}

/**
 * Full-page overlay component shown when user is offline
 * @param onCheckConnection - Callback that verifies server connectivity
 */
export const OfflinePage: React.FC<OfflinePageProps> = ({
  onCheckConnection,
  isChecking,
  error,
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isCheckingRef = useRef(isChecking);
  useLayoutEffect(() => {
    isCheckingRef.current = isChecking;
  }, [isChecking]);
  const interruptedFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  useEffect(() => {
    const portalTimer = window.setTimeout(() => {
      setPortalContainer(getRecoveryPortalContainer());
    });

    return () => window.clearTimeout(portalTimer);
  }, []);

  useLayoutEffect(() => {
    if (!portalContainer) {
      return;
    }

    let portalCheckQueued = false;
    let portalCheckFrame = 0;
    const portalObserver = new MutationObserver(() => {
      if (portalCheckQueued) {
        return;
      }
      portalCheckQueued = true;
      portalCheckFrame = window.requestAnimationFrame(() => {
        portalCheckQueued = false;
        const nextPortalContainer = getRecoveryPortalContainer();
        if (nextPortalContainer !== portalContainer) {
          setPortalContainer(nextPortalContainer);
        }
      });
    });
    portalObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      portalObserver.disconnect();
      window.cancelAnimationFrame(portalCheckFrame);
    };
  }, [portalContainer]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const restoreIsolation = isolateRecoveryDialog(dialog);
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }

    const keepFocusInRecovery = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) {
        const nextPortalContainer = getRecoveryPortalContainer();
        if (nextPortalContainer !== portalContainer) {
          setPortalContainer(nextPortalContainer);
          return;
        }
        (isCheckingRef.current ? dialog : buttonRef.current)?.focus();
      }
    };
    const containModalKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        (isCheckingRef.current ? dialog : buttonRef.current)?.focus();
      }
    };
    const preventCancel = (event: Event) => event.preventDefault();
    const stopSurfaceEvent = (event: Event) => event.stopPropagation();
    document.addEventListener('focusin', keepFocusInRecovery);
    window.addEventListener('keydown', containModalKeys, true);
    dialog.addEventListener('cancel', preventCancel);
    dialog.addEventListener('pointerdown', stopSurfaceEvent);
    dialog.addEventListener('pointerup', stopSurfaceEvent);

    return () => {
      document.removeEventListener('focusin', keepFocusInRecovery);
      window.removeEventListener('keydown', containModalKeys, true);
      dialog.removeEventListener('cancel', preventCancel);
      dialog.removeEventListener('pointerdown', stopSurfaceEvent);
      dialog.removeEventListener('pointerup', stopSurfaceEvent);
      restoreIsolation();
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    };
  }, [portalContainer]);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (isChecking) {
        dialogRef.current?.focus();
      } else {
        buttonRef.current?.focus();
      }
    });

    return () => window.clearTimeout(focusTimer);
  }, [isChecking, portalContainer]);

  useEffect(
    () => () => {
      const interruptedFocus = interruptedFocusRef.current;
      window.setTimeout(() => {
        if (interruptedFocus?.isConnected) {
          interruptedFocus.focus();
        }
      });
    },
    []
  );

  if (!portalContainer) {
    return null;
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      data-connection-recovery=""
      tabIndex={-1}
      className="bg-background/95 pointer-events-auto fixed inset-0 z-[100] m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 p-4 backdrop-blur-sm backdrop:bg-black/80 sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      aria-describedby="offline-description"
    >
      <div className="flex min-h-full w-full">
        <div className="m-auto flex w-full max-w-md flex-col items-center text-center">
          {/* Offline Icon */}
          <div className="bg-muted mb-6 rounded-full p-6">
            <WifiOff className="text-muted-foreground size-12" aria-hidden="true" />
          </div>

          {/* Title */}
          <h1 id="offline-title" className="text-foreground mb-4 text-2xl font-semibold">
            You're offline
          </h1>

          {/* Description */}
          <p id="offline-description" className="text-muted-foreground mb-8 text-base">
            Reconnect to save changes. Unsaved changes may be lost if you refresh or close the app
            or page.
          </p>

          <Button asChild variant="glass" size="touch">
            <button ref={buttonRef} type="button" onClick={onCheckConnection} disabled={isChecking}>
              <RefreshCw
                className={isChecking ? 'animate-spin motion-reduce:animate-none' : undefined}
                aria-hidden="true"
              />
              {isChecking ? 'Checking…' : 'Check connection'}
            </button>
          </Button>

          {error && (
            <p className="text-destructive-text mt-4" role="status">
              {error}
            </p>
          )}
        </div>
      </div>
    </dialog>,
    portalContainer
  );
};
