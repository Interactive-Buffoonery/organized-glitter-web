import { useEffect, type ReactNode } from 'react';
import {
  initializeDeletionRecovery,
  useDeletionRecovery,
} from '@/services/accountDeletion/recovery';
import { suspendDeletionAnalytics } from '@/services/accountDeletion/analytics';
import { useHideSplash } from '@/hooks/useAppReady';

export function DeletionBootstrap({ children }: { children: ReactNode }) {
  const recovery = useDeletionRecovery();
  useHideSplash();
  useEffect(() => initializeDeletionRecovery(), []);
  // Stop SDK queues before auth/analytics providers mount on receipt recovery.
  if (!recovery.ready)
    return (
      <div role="status" className="p-6">
        Checking account recovery…
      </div>
    );
  if (recovery.intents.some(intent => !intent.localCleanupDone)) suspendDeletionAnalytics();
  return <>{children}</>;
}
