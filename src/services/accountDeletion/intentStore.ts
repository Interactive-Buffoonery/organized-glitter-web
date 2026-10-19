import { AccountDeletionError, type DeletionIntent } from './types';
import { releaseDeletionTransportFence, resumeDeletionAnalytics } from './analytics';

const DATABASE = 'og-account-deletion';
const STORE = 'intents';
const STORAGE_TIMEOUT_MS = 4000;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(DATABASE) : undefined;
channel?.addEventListener('message', () => listeners.forEach(listener => listener()));

function notify(): void {
  listeners.forEach(listener => listener());
  channel?.postMessage('changed');
}

function validIntent(value: unknown): value is DeletionIntent {
  if (!value || typeof value !== 'object') return false;
  const intent = value as DeletionIntent;
  return (
    intent.version === 1 &&
    typeof intent.backendUrl === 'string' &&
    typeof intent.accountId === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(intent.proof) &&
    ['pending', 'deleted'].includes(intent.phase) &&
    ['pending', 'completed'].includes(intent.cleanup) &&
    typeof intent.localCleanupDone === 'boolean' &&
    (intent.dispatch === undefined || ['prepared', 'submitted'].includes(intent.dispatch)) &&
    (intent.transportFenceId === undefined || typeof intent.transportFenceId === 'string')
  );
}

type SignOutClaim = { kind: 'signed_out'; backendUrl: string; accountId: string; epoch: string };
function validClaim(value: unknown): value is SignOutClaim {
  const claim = value as SignOutClaim | null;
  return (
    claim?.kind === 'signed_out' &&
    typeof claim.backendUrl === 'string' &&
    typeof claim.accountId === 'string' &&
    typeof claim.epoch === 'string'
  );
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new AccountDeletionError('storage'));
    }, STORAGE_TIMEOUT_MS);
    const finish = (db?: IDBDatabase) => {
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (db) resolve(db);
      else reject(new AccountDeletionError('storage'));
    };
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: ['backendUrl', 'accountId'] });
      request.onerror = request.onblocked = () => finish();
      request.onsuccess = () => finish(request.result);
    } catch {
      finish();
    }
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void) => void
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx =
          mode === 'readwrite'
            ? db.transaction(STORE, mode, { durability: 'strict' })
            : db.transaction(STORE, mode);
      } catch {
        tx = db.transaction(STORE, mode);
      }
      let result: T;
      const timeout = setTimeout(() => {
        try {
          tx.abort();
        } catch {
          /* The transaction already settled. */
        }
        reject(new AccountDeletionError('storage'));
      }, STORAGE_TIMEOUT_MS);
      tx.oncomplete = () => {
        clearTimeout(timeout);
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        clearTimeout(timeout);
        reject(new AccountDeletionError('storage'));
      };
      operation(tx.objectStore(STORE), value => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}

export const deletionIntents = {
  async applyAuthIfClear(
    backendUrl: string,
    accountId: string,
    apply: () => boolean
  ): Promise<boolean> {
    let applicationError: unknown;
    const result = await transaction<{ allowed: boolean; value?: boolean }>(
      'readwrite',
      (store, done) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const blocked = request.result.some(value => {
            if (
              typeof value !== 'object' ||
              value === null ||
              !('backendUrl' in value) ||
              value.backendUrl !== backendUrl
            )
              return false;
            if (validClaim(value)) return false;
            if (!validIntent(value)) return true;
            return !value.localCleanupDone;
          });
          if (blocked) {
            done({ allowed: false });
            return;
          }
          try {
            const value = apply();
            if (
              value &&
              request.result.some(
                record =>
                  validClaim(record) &&
                  record.backendUrl === backendUrl &&
                  record.accountId === accountId
              )
            )
              store.delete([backendUrl, accountId]);
            done({ allowed: true, value });
          } catch (error) {
            applicationError = error;
            request.transaction?.abort();
          }
        };
      }
    ).catch(error => {
      throw applicationError ?? error;
    });
    if (!result.allowed) throw new AccountDeletionError('pending');
    return result.value === true;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async list(backendUrl: string): Promise<DeletionIntent[]> {
    const result = await transaction<unknown[]>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
    if (
      result.some(
        value =>
          typeof value === 'object' &&
          value !== null &&
          'backendUrl' in value &&
          value.backendUrl === backendUrl &&
          !validIntent(value) &&
          !validClaim(value)
      )
    )
      throw new AccountDeletionError('storage');
    return result.filter(validIntent).filter(intent => intent.backendUrl === backendUrl);
  },
  async get(
    backendUrl: string,
    accountId: string
  ): Promise<DeletionIntent | SignOutClaim | undefined> {
    const result = await transaction<unknown>('readonly', (store, done) => {
      const request = store.get([backendUrl, accountId]);
      request.onsuccess = () => done(request.result);
    });
    if (result === undefined || validIntent(result) || validClaim(result)) return result;
    throw new AccountDeletionError('storage');
  },
  async create(intent: DeletionIntent): Promise<DeletionIntent> {
    const result = await transaction<DeletionIntent>('readwrite', (store, done) => {
      const request = store.get([intent.backendUrl, intent.accountId]);
      request.onsuccess = () => {
        if (validClaim(request.result)) {
          request.transaction?.abort();
          return;
        } else if (request.result) {
          if (!validIntent(request.result)) {
            request.transaction?.abort();
            return;
          }
          done(request.result);
        } else {
          store.add(intent);
          done(intent);
        }
      };
    });
    notify();
    return result;
  },
  async claimSignOut(backendUrl: string, accountId: string, epoch: string): Promise<boolean> {
    const claimed = await transaction<boolean>('readwrite', (store, done) => {
      const request = store.get([backendUrl, accountId]);
      request.onsuccess = () => {
        if (request.result && !validClaim(request.result)) {
          if (!validIntent(request.result)) request.transaction?.abort();
          else done(false);
          return;
        }
        store.put({ kind: 'signed_out', backendUrl, accountId, epoch } satisfies SignOutClaim);
        done(true);
      };
    });
    if (claimed) notify();
    return claimed;
  },
  async markSubmitted(intent: DeletionIntent): Promise<DeletionIntent> {
    const result = await transaction<DeletionIntent>('readwrite', (store, done) => {
      const request = store.get([intent.backendUrl, intent.accountId]);
      request.onsuccess = () => {
        if (
          !validIntent(request.result) ||
          request.result.proof !== intent.proof ||
          request.result.dispatch !== 'prepared'
        ) {
          request.transaction?.abort();
          return;
        }
        const next = { ...request.result, dispatch: 'submitted' as const };
        store.put(next);
        done(next);
      };
    });
    notify();
    return result;
  },
  async cancelPrepared(intent: DeletionIntent): Promise<boolean> {
    const cancelled = await transaction<boolean>('readwrite', (store, done) => {
      const request = store.get([intent.backendUrl, intent.accountId]);
      request.onsuccess = () => {
        if (
          validIntent(request.result) &&
          request.result.proof === intent.proof &&
          request.result.dispatch === 'prepared'
        ) {
          store.delete([intent.backendUrl, intent.accountId]);
          done(true);
        } else done(false);
      };
    });
    if (cancelled) {
      if (intent.transportFenceId)
        releaseDeletionTransportFence(intent.backendUrl, intent.accountId, intent.transportFenceId);
      resumeDeletionAnalytics();
      notify();
    }
    return cancelled;
  },
  async update(intent: DeletionIntent): Promise<DeletionIntent> {
    const result = await transaction<DeletionIntent>('readwrite', (store, done) => {
      const request = store.get([intent.backendUrl, intent.accountId]);
      request.onsuccess = () => {
        const previous = request.result;
        if (!validIntent(previous) || previous.proof !== intent.proof) {
          request.transaction?.abort();
          return;
        }
        const next: DeletionIntent = {
          ...intent,
          phase: previous.phase === 'deleted' ? 'deleted' : intent.phase,
          cleanup: previous.cleanup === 'completed' ? 'completed' : intent.cleanup,
          localCleanupDone: previous.localCleanupDone || intent.localCleanupDone,
        };
        store.put(next);
        done(next);
      };
    });
    notify();
    return result;
  },
  async remove(intent: DeletionIntent): Promise<void> {
    if (intent.phase !== 'deleted' || !intent.localCleanupDone || intent.cleanup !== 'completed')
      throw new AccountDeletionError('pending');
    await transaction<void>('readwrite', (store, done) => {
      const request = store.get([intent.backendUrl, intent.accountId]);
      request.onsuccess = () => {
        if (validIntent(request.result) && request.result.proof === intent.proof)
          store.delete([intent.backendUrl, intent.accountId]);
        done(undefined);
      };
    });
    notify();
  },
};
