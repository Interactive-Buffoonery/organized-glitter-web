import { pb } from '@/lib/pocketbase';

let accountId = pb.authStore.token ? (pb.authStore.record?.id ?? null) : null;
let generation = 0;

pb.authStore.onChange((token, record) => {
  const nextAccountId = token ? (record?.id ?? null) : null;
  if (nextAccountId !== accountId) {
    accountId = nextAccountId;
    generation += 1;
  }
});

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
