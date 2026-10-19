import PocketBase, { BaseAuthStore } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { captureSessionIdentity, isCurrentSessionIdentity } from './sessionIdentity';
import type { OAuthProvider } from './types';
import type { FreshDeletionProof } from '@/services/accountDeletion/types';

type VerificationResult =
  { success: true; proof: FreshDeletionProof } | { success: false; error: string };

function prepare(accountId: string): FreshDeletionProof | undefined {
  const identity = captureSessionIdentity();
  if (
    !pb.authStore.token ||
    pb.authStore.record?.id !== accountId ||
    pb.authStore.record?.verified !== true ||
    identity.accountId !== accountId ||
    !isCurrentSessionIdentity(identity)
  )
    return;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return {
    action: 'delete_account',
    accountId,
    value,
    identity,
    expiresAt: Date.now() + 5 * 60_000,
  };
}

const failure = (): VerificationResult => ({
  success: false,
  error:
    'Could not verify your identity. Use your current password or an existing connected sign-in method and try again.',
});

export async function requestDeletionPasswordProof(
  password: string,
  accountId: string
): Promise<VerificationResult> {
  const proof = prepare(accountId);
  if (!proof || !password) return failure();
  const token = pb.authStore.token;
  const client = new PocketBase(pb.baseURL, new BaseAuthStore());
  try {
    await client.send('/api/auth/step-up/password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      requestKey: null,
      body: { action: 'delete_account', targetProvider: 'account', password, proof: proof.value },
    });
    if (!isCurrentSessionIdentity(proof.identity)) return failure();
    return { success: true, proof };
  } catch {
    return failure();
  } finally {
    client.authStore.clear();
  }
}

export async function requestDeletionOAuthProof(
  provider: OAuthProvider,
  accountId: string
): Promise<VerificationResult> {
  const proof = prepare(accountId);
  if (!proof) return failure();
  const client = new PocketBase(pb.baseURL, new BaseAuthStore());
  try {
    // PocketBase opens the popup here, before the first await, to retain Safari's click gesture.
    const pending = client.collection('users').authWithOAuth2({
      provider,
      createData: {
        og_step_up_action: 'delete_account',
        og_step_up_target_provider: 'account',
        og_step_up_user_id: accountId,
        og_step_up_proof: proof.value,
      },
    });
    const result = await pending;
    if (
      result.record.id !== accountId ||
      result.record.verified !== true ||
      !isCurrentSessionIdentity(proof.identity)
    )
      return failure();
    return { success: true, proof };
  } catch {
    return failure();
  } finally {
    client.authStore.clear();
  }
}
