import type { SessionIdentity } from '@/services/auth/sessionIdentity';

export type DeletionCleanup = 'pending' | 'completed';

export type DeletionIntent = {
  version: 1;
  backendUrl: string;
  accountId: string;
  proof: string;
  phase: 'pending' | 'deleted';
  cleanup: DeletionCleanup;
  localCleanupDone: boolean;
  // Older receipts without this field may already have been dispatched.
  dispatch?: 'prepared' | 'submitted';
  transportFenceId?: string;
};

export type FreshDeletionProof = {
  action: 'delete_account';
  accountId: string;
  value: string;
  identity: SessionIdentity;
  expiresAt: number;
};

export type DeletionFailureReason =
  'verification' | 'account_changed' | 'storage' | 'pending' | 'uncertain' | 'local_cleanup';

export class AccountDeletionError extends Error {
  constructor(public readonly reason: DeletionFailureReason) {
    const messages: Record<DeletionFailureReason, string> = {
      verification: 'Verify your identity again before deleting your account.',
      account_changed: 'Your signed-in session changed. This request cannot continue.',
      storage: 'Private browser storage is unavailable. No new deletion request was sent.',
      pending: 'An earlier deletion request needs to be resolved first.',
      uncertain:
        'Deletion is not confirmed. Your unfinished edits are being kept. Check the status again or contact support.',
      local_cleanup:
        'Account deleted. Local cleanup could not finish. Retry cleanup on this device.',
    };
    super(messages[reason]);
    this.name = 'AccountDeletionError';
  }
}
