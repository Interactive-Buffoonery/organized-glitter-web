import { AccountDeletionError, type DeletionIntent } from './types';

const DATABASE = 'og-account-deletion';
const STORE = 'intents';
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
    typeof intent.localCleanupDone === 'boolean'
  );
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: ['backendUrl', 'accountId'] });
      request.onerror = request.onblocked = () => reject(new AccountDeletionError('storage'));
      request.onsuccess = () => resolve(request.result);
    } catch {
      reject(new AccountDeletionError('storage'));
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
      const tx = db.transaction(STORE, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new AccountDeletionError('storage'));
      operation(tx.objectStore(STORE), value => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}

export const deletionIntents = {
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
    if (result.some(value => !validIntent(value))) throw new AccountDeletionError('storage');
    return (result as DeletionIntent[]).filter(intent => intent.backendUrl === backendUrl);
  },
  async get(backendUrl: string, accountId: string): Promise<DeletionIntent | undefined> {
    return (await this.list(backendUrl)).find(intent => intent.accountId === accountId);
  },
  async create(intent: DeletionIntent): Promise<DeletionIntent> {
    const result = await transaction<DeletionIntent>('readwrite', (store, done) => {
      const request = store.get([intent.backendUrl, intent.accountId]);
      request.onsuccess = () => {
        if (request.result) {
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
