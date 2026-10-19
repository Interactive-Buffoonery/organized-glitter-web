import { useSyncExternalStore } from 'react';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { deletionIntents } from './intentStore';
import type { DeletionIntent } from './types';

let state = { ready: false, intents: [] as DeletionIntent[], error: false };
let started = false;
let sequence = 0;
const listeners = new Set<() => void>();

export async function refreshDeletionRecovery(): Promise<void> {
  const revision = ++sequence;
  try {
    const intents = await deletionIntents.list(POCKETBASE_URL);
    if (revision !== sequence) return;
    state = { ready: true, intents, error: false };
  } catch {
    if (revision !== sequence) return;
    state = { ...state, ready: true, error: true };
  }
  listeners.forEach(listener => listener());
}

export function initializeDeletionRecovery(): void {
  if (started) return;
  started = true;
  deletionIntents.subscribe(() => {
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
