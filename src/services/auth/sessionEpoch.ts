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
}

interface StoredSession {
  accountId: string | null;
  token: string;
}

interface EpochMarker {
  accountId: string | null;
  epoch: string;
}

type MarkerRead =
  | { kind: 'valid'; marker: EpochMarker }
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
      return { kind: 'valid', marker };
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

export function createSessionIdentityTracker(
  authStore: AuthStoreLike,
  storage: Storage | null | undefined = currentBrowserStorage()
): SessionIdentityTracker {
  let observed = liveSession(authStore) ?? { accountId: null, token: '' };
  let generation = 0;
  let epoch = '';
  let markerWriteFailed = false;

  const reconcileSession = (session: StoredSession, initializing = false): void => {
    const previousAccountId = observed.accountId;
    const previousEpoch = epoch;

    if (storage === null) {
      if (!epoch || session.accountId !== previousAccountId) epoch = nextEpoch();
    } else {
      const shared = readMarker(storage);
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
