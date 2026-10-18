import { pb } from '@/lib/pocketbase';
import { retainSignedOutCreateTokens } from './sessionRecovery';

let accountId = pb.authStore.token ? (pb.authStore.record?.id ?? null) : null;
let generation = 0;

pb.authStore.onChange((token, record) => {
  const nextAccountId = token ? (record?.id ?? null) : null;
  if (nextAccountId !== accountId) {
    accountId = nextAccountId;
    generation += 1;
  }
});

function storedSession(
  value: string | null
): { accountId: string | null; token: string } | undefined {
  if (!value) return { accountId: null, token: '' };
  try {
    const stored = JSON.parse(value);
    const token = typeof stored?.token === 'string' ? stored.token : '';
    const record = stored?.record ?? stored?.model;
    return { accountId: token && typeof record?.id === 'string' ? record.id : null, token };
  } catch {
    return undefined;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== 'pocketbase_auth') return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    const previous = storedSession(event.oldValue);
    const next = storedSession(event.newValue);
    // The SDK reads current storage, which can skip queued logout transitions.
    if (previous && next && previous.accountId !== next.accountId) {
      generation += 1;
      if (previous.accountId && previous.token) {
        retainSignedOutCreateTokens(previous.accountId, [previous.token]);
      }
    }
  });
}

export interface SessionIdentity {
  readonly accountId: string | null;
  readonly generation: number;
}

export function captureSessionIdentity(): SessionIdentity {
  return { accountId, generation };
}

export function isCurrentSessionIdentity(identity: SessionIdentity): boolean {
  return identity.accountId === accountId && identity.generation === generation;
}
