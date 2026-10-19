import { pb } from '@/lib/pocketbase';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { queryClient } from '@/lib/queryClient';
import { isCurrentSessionIdentity } from '@/services/auth/sessionIdentity';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import { suspendDeletionAnalytics } from '@/services/accountDeletion/analytics';
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
    try {
      intent = await deletionIntents.create({
        version: 1,
        backendUrl: POCKETBASE_URL,
        accountId: proof.accountId,
        proof: proof.value,
        phase: 'pending',
        cleanup: 'pending',
        localCleanupDone: false,
      });
    } catch {
      throw new AccountDeletionError('storage');
    }
    if (!isCurrentSessionIdentity(proof.identity))
      throw new AccountDeletionError('account_changed');
    if (intent.proof !== proof.value) throw new AccountDeletionError('pending');
    suspendDeletionAnalytics();
    await queryClient.cancelQueries();
    if (!isCurrentSessionIdentity(proof.identity))
      throw new AccountDeletionError('account_changed');
    return this.send(intent, token);
  }

  static async retry(intent: DeletionIntent): Promise<DeletionIntent> {
    if (intent.backendUrl !== POCKETBASE_URL || !/^[A-Za-z0-9_-]{43}$/.test(intent.proof))
      throw new AccountDeletionError('verification');
    return this.send(intent);
  }

  private static async send(intent: DeletionIntent, token?: string): Promise<DeletionIntent> {
    try {
      // Dedicated fetch has no auth-refresh, mutation retry, or shared-session hooks.
      const response = await fetch(`${intent.backendUrl}/api/account/delete`, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ proof: intent.proof, confirmed: true }),
      });
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
    }
  }
}
