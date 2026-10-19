import { useEffect, type ReactNode } from 'react';
import posthog from 'posthog-js';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';
import { useDeletionRecovery } from '@/services/accountDeletion/recovery';
import {
  discardDeletionAnalyticsQueues,
  suspendDeletionAnalytics,
  resumeDeletionAnalytics,
  isDeletionAnalyticsSuspended,
} from '@/services/accountDeletion/analytics';
import {
  clearRememberedAnalyticsConsent,
  syncAnalyticsConsent,
} from '@/services/analytics-preference';

export function DeletionRecoveryBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const recovery = useDeletionRecovery();
  const pending = recovery.intents.find(intent => !intent.localCleanupDone);
  useEffect(() => {
    if (!pending) return;
    suspendDeletionAnalytics();
    void queryClient.cancelQueries();
  }, [pending]);
  useEffect(() => {
    if (!recovery.ready || recovery.error || pending || !isDeletionAnalyticsSuspended()) return;
    const completed = recovery.intents.filter(
      intent => intent.phase === 'deleted' && intent.localCleanupDone
    );
    if (!completed.length) {
      resumeDeletionAnalytics();
      syncAnalyticsConsent();
      return;
    }
    if (user) return;
    discardDeletionAnalyticsQueues();
    posthog.reset();
    completed.forEach(intent => clearRememberedAnalyticsConsent(intent.accountId));
    resumeDeletionAnalytics();
    syncAnalyticsConsent();
  }, [user, pending, recovery]);
  if (pending && location.pathname !== '/delete-account')
    return <Navigate to="/delete-account" replace />;
  return <>{children}</>;
}
