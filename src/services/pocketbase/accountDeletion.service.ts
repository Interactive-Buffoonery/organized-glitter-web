import { pb } from '@/lib/pocketbase';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { queryClient } from '@/lib/queryClient';
import { isCurrentSessionIdentity } from '@/services/auth/sessionIdentity';
import { hasKnownExpiredDeletionSession } from '@/services/auth/deletionSession';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import {
  armDeletionTransportFence,
  releaseDeletionTransportFence,
  resumeDeletionAnalytics,
  suspendDeletionAnalytics,
} from '@/services/accountDeletion/analytics';
import { syncAnalyticsConsent } from '@/services/analytics-preference';
import {
  AccountDeletionError,
  type DeletionIntent,
  type FreshDeletionProof,
} from '@/services/accountDeletion/types';

export class AccountDeletionService {
  static async deleteAccount(proof: FreshDeletionProof): Promise<DeletionIntent> {
    if (
      proof.action !== 'delete_account' ||
      proof.accountId !== proof.identity.accountId ||
      proof.expiresAt <= Date.now() ||
      !/^[A-Za-z0-9_-]{43}$/.test(proof.value)
    )
      throw new AccountDeletionError('verification');
    if (!isCurrentSessionIdentity(proof.identity))
      throw new AccountDeletionError('account_changed');
    const token = pb.authStore.token;
    let intent: DeletionIntent;
    let transportFenceId: string | undefined;
    try {
      transportFenceId = armDeletionTransportFence(POCKETBASE_URL, proof.accountId);
      suspendDeletionAnalytics();
      intent = await deletionIntents.create({
        version: 1,
        backendUrl: POCKETBASE_URL,
        accountId: proof.accountId,
        proof: proof.value,
        phase: 'pending',
        cleanup: 'pending',
        localCleanupDone: false,
        dispatch: 'prepared',
        transportFenceId,
      });
    } catch (error) {
      if (transportFenceId) {
        try {
          const current = await deletionIntents.get(POCKETBASE_URL, proof.accountId);
          if (!current || !('proof' in current) || current.proof !== proof.value) {
            releaseDeletionTransportFence(POCKETBASE_URL, proof.accountId, transportFenceId);
            if (!current) {
              resumeDeletionAnalytics();
              syncAnalyticsConsent();
            }
          }
        } catch {
          // A possibly committed intent must keep its transport fence.
        }
      }
      if (error instanceof AccountDeletionError) throw error;
      throw new AccountDeletionError('storage');
    }
    if (intent.proof !== proof.value) {
      releaseDeletionTransportFence(POCKETBASE_URL, proof.accountId, transportFenceId);
      throw new AccountDeletionError('pending');
    }
    if (!isCurrentSessionIdentity(proof.identity)) {
      if (!(await deletionIntents.cancelPrepared(intent)))
        throw new AccountDeletionError('uncertain');
      syncAnalyticsConsent();
      throw new AccountDeletionError('account_changed');
    }
    if (proof.expiresAt <= Date.now()) {
      if (!(await deletionIntents.cancelPrepared(intent)))
        throw new AccountDeletionError('uncertain');
      syncAnalyticsConsent();
      throw new AccountDeletionError('verification');
    }
    try {
      await queryClient.cancelQueries();
    } catch {
      if (!(await deletionIntents.cancelPrepared(intent)))
        throw new AccountDeletionError('uncertain');
      syncAnalyticsConsent();
      throw new AccountDeletionError('verification');
    }
    if (!isCurrentSessionIdentity(proof.identity)) {
      if (!(await deletionIntents.cancelPrepared(intent)))
        throw new AccountDeletionError('uncertain');
      syncAnalyticsConsent();
      throw new AccountDeletionError('account_changed');
    }
    if (proof.expiresAt <= Date.now()) {
      if (!(await deletionIntents.cancelPrepared(intent)))
        throw new AccountDeletionError('uncertain');
      syncAnalyticsConsent();
      throw new AccountDeletionError('verification');
    }
    // Commit the may-have-been-sent state before the first possible network dispatch.
    const submitted = await deletionIntents.markSubmitted(intent);
    if (!isCurrentSessionIdentity(proof.identity)) throw new AccountDeletionError('uncertain');
    return this.send(submitted, token);
  }

  static async retry(intent: DeletionIntent): Promise<DeletionIntent> {
    if (intent.backendUrl !== POCKETBASE_URL || !/^[A-Za-z0-9_-]{43}$/.test(intent.proof))
      throw new AccountDeletionError('verification');
    if (intent.dispatch === 'prepared') throw new AccountDeletionError('verification');
    return this.send(intent);
  }

  static async retryAuthenticated(
    intent: DeletionIntent,
    proof: FreshDeletionProof,
    confirmed: boolean
  ): Promise<DeletionIntent> {
    if (
      confirmed !== true ||
      intent.dispatch === 'prepared' ||
      intent.phase !== 'pending' ||
      intent.backendUrl !== POCKETBASE_URL ||
      proof.action !== 'delete_account' ||
      proof.accountId !== intent.accountId ||
      proof.value !== intent.proof ||
      proof.expiresAt <= Date.now() ||
      !isCurrentSessionIdentity(proof.identity) ||
      pb.authStore.record?.id !== intent.accountId ||
      !pb.authStore.token ||
      hasKnownExpiredDeletionSession()
    )
      throw new AccountDeletionError('verification');
    return this.send(intent, pb.authStore.token);
  }

  private static async send(intent: DeletionIntent, token?: string): Promise<DeletionIntent> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Dedicated fetch has no auth-refresh, mutation retry, or shared-session hooks.
      const request = fetch(`${intent.backendUrl}/api/account/delete`, {
        method: 'POST',
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ proof: intent.proof, confirmed: true }),
      });
      const response = await Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new AccountDeletionError('uncertain'));
          }, 30_000);
        }),
      ]);
      if (response.status !== 200) throw new AccountDeletionError('uncertain');
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('status' in result) ||
        result.status !== 'deleted' ||
        !('cleanup' in result) ||
        (result.cleanup !== 'pending' && result.cleanup !== 'completed')
      )
        throw new AccountDeletionError('uncertain');
      return await deletionIntents.update({ ...intent, phase: 'deleted', cleanup: result.cleanup });
    } catch {
      throw new AccountDeletionError('uncertain');
    } finally {
      clearTimeout(timeout);
    }
  }
}
