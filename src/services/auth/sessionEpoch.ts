import { retainSignedOutCreateTokens } from './sessionRecovery';

const AUTH_STORAGE_KEY = 'pocketbase_auth';
const EPOCH_STORAGE_KEY = `og:session-identity:v1:${AUTH_STORAGE_KEY}`;

interface AuthRecordLike {
  id?: string;
}

interface AuthStoreLike {
  readonly token: string;
  readonly record: AuthRecordLike | null;
  onChange(listener: (token: string, record: AuthRecordLike | null) => void): unknown;
  save?(token: string, record?: AuthRecordLike | null): unknown;
  clear?(): unknown;
}

interface StoredSession {
  accountId: string | null;
  token: string;
}

interface EpochMarker {
  accountId: string | null;
  epoch: string;
  transition?: boolean;
}

type MarkerRead =
  | { kind: 'valid'; marker: EpochMarker }
  | { kind: 'transition'; marker: EpochMarker }
  | { kind: 'missing' | 'invalid' | 'unavailable' | 'memory' };

export interface SessionIdentity {
  readonly accountId: string | null;
  readonly generation: number;
  readonly epoch: string;
}

export interface SessionIdentityTracker {
  capture(): SessionIdentity;
  isCurrent(identity: SessionIdentity): boolean;
}

const sharedTrackers = new WeakMap<object, SessionIdentityTracker>();
const authMutationHooks = new WeakMap<object, Set<(next: StoredSession) => () => void>>();
let observingHistoricalTokens = false;
let fallbackEpochSequence = 0;

function nextEpoch(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Use the collision-resistant fallback when browser crypto is unavailable.
  }
  fallbackEpochSequence += 1;
  return `${Date.now().toString(36)}-${fallbackEpochSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function currentBrowserStorage(): Storage | null | undefined {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function liveSession(authStore: AuthStoreLike): StoredSession | undefined {
  try {
    const token = authStore.token;
    const record = authStore.record;
    return {
      accountId: token && typeof record?.id === 'string' ? record.id : null,
      token,
    };
  } catch {
    return undefined;
  }
}

function readMarker(storage: Storage | null | undefined): MarkerRead {
  if (storage === null) return { kind: 'memory' };
  if (!storage) return { kind: 'unavailable' };
  let value: string | null;
  try {
    value = storage.getItem(EPOCH_STORAGE_KEY);
  } catch {
    return { kind: 'unavailable' };
  }
  if (value === null) return { kind: 'missing' };
  try {
    const marker = JSON.parse(value);
    if (
      (marker?.accountId === null || typeof marker?.accountId === 'string') &&
      typeof marker?.epoch === 'string' &&
      marker.epoch.length > 0
    ) {
      return { kind: marker.transition === true ? 'transition' : 'valid', marker };
    }
  } catch {
    // A corrupt marker invalidates prior work until capture repairs it.
  }
  return { kind: 'invalid' };
}

function writeMarker(storage: Storage | undefined, marker: EpochMarker): boolean {
  if (!storage) return false;
  try {
    storage.setItem(EPOCH_STORAGE_KEY, JSON.stringify(marker));
    return true;
  } catch {
    return false;
  }
}

function removeMarker(storage: Storage | undefined): void {
  try {
    storage?.removeItem(EPOCH_STORAGE_KEY);
  } catch {
    // The local failure latch still prevents this tracker from accepting the stale marker.
  }
}

function rememberSession(session: StoredSession): void {
  if (session.accountId && session.token) {
    retainSignedOutCreateTokens(session.accountId, [session.token]);
  }
}

function storedSession(value: string | null): StoredSession | undefined {
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

function observeHistoricalTokens(storage: Storage | null | undefined): void {
  if (observingHistoricalTokens || typeof window === 'undefined') return;
  observingHistoricalTokens = true;
  window.addEventListener('storage', event => {
    if (event.key !== AUTH_STORAGE_KEY) return;
    if (event.storageArea && storage && event.storageArea !== storage) return;
    const previous = storedSession(event.oldValue);
    if (previous) rememberSession(previous);
  });
}

function registerAuthMutationHook(
  authStore: AuthStoreLike,
  hook: (next: StoredSession) => () => void
): void {
  let hooks = authMutationHooks.get(authStore);
  if (!hooks) {
    hooks = new Set();
    authMutationHooks.set(authStore, hooks);

    const begin = (next: StoredSession): Array<() => void> => {
      const finishers: Array<() => void> = [];
      for (const registeredHook of hooks!) {
        try {
          finishers.push(registeredHook(next));
        } catch {
          // Session tracking must not prevent the auth store from handling the mutation.
        }
      }
      return finishers;
    };
    const finish = (finishers: Array<() => void>): void => {
      for (const complete of finishers) {
        try {
          complete();
        } catch {
          // Preserve an exception from the underlying auth mutation.
        }
      }
    };

    const originalSave = authStore.save;
    if (typeof originalSave === 'function') {
      authStore.save = new Proxy(originalSave, {
        apply(target, thisArg, args) {
          const token = args[0] as string;
          const record = args[1] as AuthRecordLike | null | undefined;
          const finishers = begin({
            accountId: token && typeof record?.id === 'string' ? record.id : null,
            token,
          });
          try {
            return Reflect.apply(target, thisArg, args);
          } finally {
            finish(finishers);
          }
        },
      });
    }

    const originalClear = authStore.clear;
    if (typeof originalClear === 'function') {
      authStore.clear = new Proxy(originalClear, {
        apply(target, thisArg, args) {
          const finishers = begin({ accountId: null, token: '' });
          try {
            return Reflect.apply(target, thisArg, args);
          } finally {
            finish(finishers);
          }
        },
      });
    }
  }
  hooks.add(hook);
}

export function createSessionIdentityTracker(
  authStore: AuthStoreLike,
  storage: Storage | null | undefined = currentBrowserStorage()
): SessionIdentityTracker {
  let observed = liveSession(authStore) ?? { accountId: null, token: '' };
  let generation = 0;
  let epoch = '';
  let markerWriteFailed = false;
  let transitionInProgress = false;

  const reconcileSession = (session: StoredSession, initializing = false): void => {
    const previousAccountId = observed.accountId;
    const previousEpoch = epoch;

    if (transitionInProgress) {
      observed = session;
      return;
    }

    if (storage === null) {
      if (!epoch || session.accountId !== previousAccountId) epoch = nextEpoch();
    } else {
      const shared = readMarker(storage);
      if (shared.kind === 'transition') {
        epoch = '';
        observed = session;
        if (!initializing && previousEpoch) generation += 1;
        return;
      }
      if (
        !markerWriteFailed &&
        shared.kind === 'valid' &&
        shared.marker.accountId === session.accountId
      ) {
        epoch = shared.marker.epoch;
      } else {
        const replacement = nextEpoch();
        if (writeMarker(storage, { accountId: session.accountId, epoch: replacement })) {
          epoch = replacement;
          markerWriteFailed = false;
        } else {
          epoch = '';
          markerWriteFailed = true;
          removeMarker(storage);
        }
      }
    }

    observed = session;
    if (!initializing && (session.accountId !== previousAccountId || epoch !== previousEpoch)) {
      generation += 1;
    }
  };

  reconcileSession(observed, true);

  authStore.onChange((token, record) => {
    rememberSession(observed);
    reconcileSession({
      accountId: token && typeof record?.id === 'string' ? record.id : null,
      token,
    });
  });

  registerAuthMutationHook(authStore, next => {
    const current = liveSession(authStore) ?? observed;
    const shared = readMarker(storage);
    if (current.accountId === next.accountId && shared.kind !== 'transition') return () => {};

    rememberSession(current);
    const transitionEpoch = nextEpoch();
    transitionInProgress = true;
    generation += 1;
    epoch = '';

    if (storage !== null) {
      if (
        writeMarker(storage, {
          accountId: next.accountId,
          epoch: transitionEpoch,
          transition: true,
        })
      ) {
        markerWriteFailed = false;
      } else {
        markerWriteFailed = true;
        removeMarker(storage);
      }
    }

    return () => {
      const actual = liveSession(authStore);
      transitionInProgress = false;
      if (!actual) {
        epoch = '';
        markerWriteFailed = true;
        removeMarker(storage ?? undefined);
        return;
      }

      observed = actual;
      if (storage === null) {
        epoch = transitionEpoch;
        return;
      }
      if (writeMarker(storage, { accountId: actual.accountId, epoch: transitionEpoch })) {
        epoch = transitionEpoch;
        markerWriteFailed = false;
      } else {
        epoch = '';
        markerWriteFailed = true;
        removeMarker(storage);
      }
    };
  });

  return {
    capture(): SessionIdentity {
      const session = liveSession(authStore);
      if (!session) return { accountId: null, generation, epoch: '' };
      rememberSession(session);
      reconcileSession(session);
      return { accountId: observed.accountId, generation, epoch };
    },

    isCurrent(identity: SessionIdentity): boolean {
      const session = liveSession(authStore);
      if (!session) return false;
      if (storage === null) {
        return (
          identity.accountId === session.accountId &&
          identity.generation === generation &&
          identity.epoch === epoch
        );
      }
      const shared = readMarker(storage);
      return (
        !markerWriteFailed &&
        shared.kind === 'valid' &&
        shared.marker.accountId === session.accountId &&
        identity.accountId === session.accountId &&
        identity.epoch === shared.marker.epoch
      );
    },
  };
}

export function getSessionIdentityTracker(authStore: AuthStoreLike): SessionIdentityTracker {
  const existing = sharedTrackers.get(authStore);
  if (existing) return existing;
  const storage = currentBrowserStorage();
  const tracker = createSessionIdentityTracker(authStore, storage);
  sharedTrackers.set(authStore, tracker);
  observeHistoricalTokens(storage);
  return tracker;
}
