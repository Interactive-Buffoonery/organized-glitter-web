import posthog from 'posthog-js';
import { pb } from '@/lib/pocketbase';
import { queryClient } from '@/lib/queryClient';
import { clearAccountDrafts } from '@/hooks/drafts/formDraftStorage';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/services/auth/sessionIdentity';
import { clearSessionDrafts, markSessionTokenInactive } from '@/services/auth/sessionRecovery';
import {
  clearRememberedAnalyticsConsent,
  syncAnalyticsConsent,
} from '@/services/analytics-preference';
import { deletionIntents } from './intentStore';
import { resumeDeletionAnalytics, suspendDeletionAnalytics } from './analytics';
import { AccountDeletionError, type DeletionIntent } from './types';

export async function finishDeletionCleanup(intent: DeletionIntent): Promise<DeletionIntent> {
  if (intent.phase !== 'deleted') throw new AccountDeletionError('uncertain');
  const identity = captureSessionIdentity();
  if (identity.accountId && identity.accountId !== intent.accountId)
    throw new AccountDeletionError('account_changed');
  suspendDeletionAnalytics();
  await queryClient.cancelQueries();
  if (!isCurrentSessionIdentity(identity)) throw new AccountDeletionError('account_changed');
  try {
    if (!clearAccountDrafts({ backendUrl: intent.backendUrl, accountId: intent.accountId }))
      throw new AccountDeletionError('local_cleanup');
    // No awaits between the session fence and synchronous identity/cache cleanup.
    clearSessionDrafts(intent.accountId);
    if (identity.accountId === intent.accountId) {
      markSessionTokenInactive(pb.authStore.token);
      pb.authStore.clear();
    }
    queryClient.clear();
    posthog.reset();
    clearRememberedAnalyticsConsent(intent.accountId);
    const signedOutIdentity = captureSessionIdentity();
    if (signedOutIdentity.accountId) throw new AccountDeletionError('account_changed');
    const updated = await deletionIntents.update({ ...intent, localCleanupDone: true });
    if (!isCurrentSessionIdentity(signedOutIdentity))
      throw new AccountDeletionError('account_changed');
    resumeDeletionAnalytics();
    syncAnalyticsConsent();
    return updated;
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    throw new AccountDeletionError('local_cleanup');
  }
}
