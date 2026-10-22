import { useEffect, useState, type ReactNode } from 'react';
import {
  finishInterruptedSignOut,
  initializeDeletionRecovery,
  refreshDeletionRecovery,
  useDeletionRecovery,
} from '@/services/accountDeletion/recovery';
import { suspendDeletionAnalytics } from '@/services/accountDeletion/analytics';
import { useHideSplash } from '@/hooks/useAppReady';

export function DeletionBootstrap({ children }: { children: ReactNode }) {
  const recovery = useDeletionRecovery();
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  useHideSplash();
  useEffect(() => initializeDeletionRecovery(), []);
  const finishSignOut = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError(false);
    try {
      await finishInterruptedSignOut();
      window.location.assign('/login');
    } catch {
      setFinishError(true);
    } finally {
      setFinishing(false);
    }
  };
  // Stop SDK queues before auth/analytics providers mount on receipt recovery.
  if (!recovery.ready)
    return (
      <div role="status" className="p-6">
        Checking account recovery…
      </div>
    );
  if (recovery.fenceChecking)
    return (
      <div role="status" className="p-6">
        Checking account recovery…
      </div>
    );
  if (recovery.error)
    return (
      <div role="alert" className="p-6">
        Account recovery storage could not be checked. Your unfinished edits are being kept.
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => void refreshDeletionRecovery()}
        >
          Retry recovery check
        </button>
      </div>
    );
  if (recovery.claimBlocked)
    return (
      <div role="alert" className="p-6">
        Sign-out was interrupted. Your account and unfinished edits remain locked on this device.
        <button
          type="button"
          className="ml-3 underline"
          disabled={finishing}
          onClick={() => void finishSignOut()}
        >
          {finishing ? 'Finishing sign-out…' : 'Finish signing out'}
        </button>
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => void refreshDeletionRecovery()}
        >
          Retry recovery check
        </button>{' '}
        {finishError && (
          <p>Could not finish signing out. Your session and unfinished edits are being kept.</p>
        )}
        <a className="underline" href="mailto:support@organizedglitter.app">
          Contact support
        </a>
      </div>
    );
  if (recovery.orphanFence)
    return (
      <div role="alert" className="p-6">
        An unfinished deletion transport check is still protecting account data. Your edits remain
        locked on this device.
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => void refreshDeletionRecovery()}
        >
          Retry recovery check
        </button>{' '}
        <a className="underline" href="mailto:support@organizedglitter.app">
          Contact support
        </a>
      </div>
    );
  if (recovery.intents.some(intent => !intent.localCleanupDone)) suspendDeletionAnalytics();
  return <>{children}</>;
}
