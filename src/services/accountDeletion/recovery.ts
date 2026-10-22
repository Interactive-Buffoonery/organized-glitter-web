import { useSyncExternalStore } from 'react';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { pb } from '@/lib/pocketbase';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/services/auth/sessionIdentity';
import {
  markSessionTokenInactive,
  retainSignedOutCreateTokens,
} from '@/services/auth/sessionRecovery';
import { deletionIntents } from './intentStore';
import {
  discardDeletionAnalyticsQueues,
  inspectUnownedDeletionTransportFence,
  recordCompletedDeletionTransportFence,
  releaseDeletionTransportFence,
} from './analytics';
import type { DeletionIntent } from './types';
import { AccountDeletionError } from './types';

let state = {
  ready: false,
  intents: [] as DeletionIntent[],
  error: false,
  claimBlocked: false,
  orphanFence: false,
  fenceChecking: false,
};
let started = false;
let sequence = 0;
let fenceCheckTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export async function finishInterruptedSignOut(): Promise<void> {
  const identity = captureSessionIdentity();
  const accountId = identity.accountId;
  const token = pb.authStore.token;
  if (!accountId || !token) throw new AccountDeletionError('account_changed');
  const current = () =>
    isCurrentSessionIdentity(identity) &&
    pb.authStore.token === token &&
    pb.authStore.record?.id === accountId;
  const intents = await deletionIntents.list(POCKETBASE_URL);
  if (!current()) throw new AccountDeletionError('account_changed');
  const claim = await deletionIntents.get(POCKETBASE_URL, accountId);
  if (!current()) throw new AccountDeletionError('account_changed');
  if (
    !claim ||
    !('kind' in claim) ||
    claim.backendUrl !== POCKETBASE_URL ||
    claim.accountId !== accountId ||
    claim.epoch !== identity.epoch ||
    intents.some(intent => !intent.localCleanupDone)
  )
    throw new AccountDeletionError('pending');
  const fence = inspectUnownedDeletionTransportFence(POCKETBASE_URL, intents);
  if (fence.orphan || fence.checking) throw new AccountDeletionError('pending');
  const finished = await deletionIntents.finishSignOutIfClaim(
    POCKETBASE_URL,
    accountId,
    identity.epoch,
    () => {
      if (!current()) return false;
      const latestFence = inspectUnownedDeletionTransportFence(POCKETBASE_URL, intents);
      if (latestFence.orphan || latestFence.checking) return false;
      retainSignedOutCreateTokens(accountId, [token]);
      markSessionTokenInactive(token);
      pb.authStore.clear();
      return true;
    }
  );
  if (!finished) throw new AccountDeletionError('pending');
  await refreshDeletionRecovery();
}

export async function refreshDeletionRecovery(): Promise<void> {
  const revision = ++sequence;
  clearTimeout(fenceCheckTimer);
  try {
    const intents = await deletionIntents.list(POCKETBASE_URL);
    const accountId = pb.authStore.record?.id;
    const record =
      accountId && pb.authStore.token
        ? await deletionIntents.get(POCKETBASE_URL, accountId)
        : undefined;
    for (const intent of intents) {
      if (intent.phase !== 'deleted' || !intent.localCleanupDone || !intent.transportFenceId)
        continue;
      if (
        recordCompletedDeletionTransportFence(
          intent.backendUrl,
          intent.accountId,
          intent.transportFenceId
        )
      )
        discardDeletionAnalyticsQueues();
      releaseDeletionTransportFence(intent.backendUrl, intent.accountId, intent.transportFenceId);
    }
    const fence = inspectUnownedDeletionTransportFence(POCKETBASE_URL, intents);
    if (revision !== sequence) return;
    state = {
      ready: true,
      intents,
      error: false,
      claimBlocked: record !== undefined && 'kind' in record,
      orphanFence: fence.orphan,
      fenceChecking: fence.checking,
    };
    if (fence.checking)
      fenceCheckTimer = setTimeout(() => void refreshDeletionRecovery(), fence.waitMs + 1);
  } catch {
    if (revision !== sequence) return;
    state = { ...state, ready: true, error: true, fenceChecking: false };
  }
  listeners.forEach(listener => listener());
}

export function initializeDeletionRecovery(): void {
  if (started) return;
  started = true;
  deletionIntents.subscribe(() => {
    void refreshDeletionRecovery();
  });
  pb.authStore.onChange(() => {
    void refreshDeletionRecovery();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      void refreshDeletionRecovery();
    });
    window.addEventListener('pageshow', () => {
      void refreshDeletionRecovery();
    });
  }
  void refreshDeletionRecovery();
}

export function useDeletionRecovery() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state
  );
}
