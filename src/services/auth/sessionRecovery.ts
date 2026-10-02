import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';

type DraftCapture = () => unknown;

const COMPLETED_CREATES_PREFIX = `og:completed-creates:v1:${encodeURIComponent(POCKETBASE_URL)}:`;
const COMPLETED_OTHER_PREFIX = `og:completed-other-create:v1:${encodeURIComponent(POCKETBASE_URL)}:`;
const MAX_COMPLETED_CREATE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_COMPLETED_CREATES_PER_ACCOUNT = 100;

function completedOtherKey(accountId: string, collection: string): string {
  return `${COMPLETED_OTHER_PREFIX}${accountId}:${collection}`;
}

function completedCreatesAccountPrefix(accountId: string): string {
  return `${COMPLETED_CREATES_PREFIX}${accountId}:`;
}

function completedCreatesKey(accountId: string, destination: string): string {
  return `${completedCreatesAccountPrefix(accountId)}${encodeURIComponent(destination)}`;
}

function destinationFromKey(key: string): { accountId: string; destination: string } | null {
  if (!key.startsWith(COMPLETED_CREATES_PREFIX)) return null;
  const suffix = key.slice(COMPLETED_CREATES_PREFIX.length);
  const separator = suffix.indexOf(':');
  if (separator < 1) return null;
  try {
    const destination = decodeURIComponent(suffix.slice(separator + 1));
    if (!/^\/(projects|coloring)\/[a-zA-Z0-9_-]+$/.test(destination)) return null;
    return { accountId: suffix.slice(0, separator), destination };
  } catch {
    return null;
  }
}

export class SessionChangedError extends Error {
  readonly reason = 'session_changed';

  constructor() {
    super('Session changed while the request completed. Check saved work before retrying.');
    this.name = 'SessionChangedError';
  }
}

export function isSessionChangedError(error: unknown): boolean {
  const pending = [error];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null || visited.has(current)) continue;
    visited.add(current);
    if ('reason' in current && current.reason === 'session_changed') return true;
    if ('originalError' in current) pending.push(current.originalError);
    if ('cause' in current) pending.push(current.cause);
  }
  return false;
}

interface CompletedFeedback {
  draftId?: string;
  message: string;
  name: string;
  email: string;
}

const activeDrafts = new Map<string, DraftCapture>();
const savedDrafts = new Map<string, unknown>();
const invalidSessionListeners = new Set<(token: string) => void>();
const completedCreateListeners = new Set<(accountId: string, destination: string) => void>();
const completedOtherCreateListeners = new Set<(accountId: string, collection: string) => void>();
const completedFeedbackListeners = new Set<
  (accountId: string, feedback: CompletedFeedback) => void
>();
const inactiveTokens = new Set<string>();
const signedOutCreateAccounts = new Map<string, string>();
const MAX_RETAINED_CREATE_TOKENS = 128;
const completedOtherCreates = new Map<string, Set<string>>();
let savedAccountId: string | null = null;
let recoveryToken: string | null = null;
let lastReportedToken: string | null = null;
let recoveryPending = false;
const pendingCompletedCreateWrites = new Map<string, Map<string, number>>();
const pendingCompletedCreateRemovals = new Map<string, Set<string>>();
const completedCreateSnapshots = new Map<string, Map<string, number>>();
let completedFeedback: (CompletedFeedback & { accountId: string }) | null = null;

function pendingFor(map: Map<string, Set<string>>, accountId: string): Set<string> {
  const pending = map.get(accountId) ?? new Set<string>();
  map.set(accountId, pending);
  return pending;
}

function setCompletedCreateSnapshot(accountId: string, entries: Iterable<[string, number]>): void {
  const now = Date.now();
  const recent = [...entries]
    .filter(([, savedAt]) => savedAt <= now && now - savedAt <= MAX_COMPLETED_CREATE_AGE_MS)
    .sort((left, right) => left[1] - right[1])
    .slice(-MAX_COMPLETED_CREATES_PER_ACCOUNT);
  completedCreateSnapshots.set(accountId, new Map(recent));
}

function prunePendingCreateWrites(accountId: string): void {
  const writes = pendingCompletedCreateWrites.get(accountId);
  if (!writes) return;
  const now = Date.now();
  for (const [destination, savedAt] of writes) {
    if (savedAt > now || now - savedAt > MAX_COMPLETED_CREATE_AGE_MS) {
      writes.delete(destination);
    }
  }
  while (writes.size > MAX_COMPLETED_CREATES_PER_ACCOUNT) {
    const oldest = writes.keys().next().value;
    if (oldest) writes.delete(oldest);
  }
  if (writes.size === 0) pendingCompletedCreateWrites.delete(accountId);
}

function flushCompletedCreateChanges(accountId: string): void {
  prunePendingCreateWrites(accountId);
  const removals = pendingCompletedCreateRemovals.get(accountId);
  for (const destination of removals ?? []) {
    try {
      localStorage.removeItem(completedCreatesKey(accountId, destination));
      removals?.delete(destination);
    } catch {
      break;
    }
  }
  const writes = pendingCompletedCreateWrites.get(accountId);
  for (const [destination, savedAt] of writes ?? []) {
    try {
      localStorage.setItem(completedCreatesKey(accountId, destination), String(savedAt));
      writes?.delete(destination);
    } catch {
      break;
    }
  }
  if (removals?.size === 0) pendingCompletedCreateRemovals.delete(accountId);
  if (writes?.size === 0) pendingCompletedCreateWrites.delete(accountId);
}

function readCompletedCreates(accountId: string): string[] {
  prunePendingCreateWrites(accountId);
  const pending = pendingCompletedCreateWrites.get(accountId) ?? new Map<string, number>();
  const removals = pendingCompletedCreateRemovals.get(accountId) ?? new Set<string>();
  try {
    flushCompletedCreateChanges(accountId);
    const prefix = completedCreatesAccountPrefix(accountId);
    const now = Date.now();
    const entries = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    )
      .filter((key): key is string => key?.startsWith(prefix) ?? false)
      .map(key => ({
        key,
        destination: destinationFromKey(key)?.destination,
        savedAt: Number(localStorage.getItem(key)),
      }));
    const recent = entries
      .filter(
        entry =>
          entry.destination &&
          Number.isFinite(entry.savedAt) &&
          entry.savedAt <= now &&
          now - entry.savedAt <= MAX_COMPLETED_CREATE_AGE_MS
      )
      .sort((left, right) => left.savedAt - right.savedAt);
    const merged = [
      ...recent.map(entry => ({ destination: entry.destination!, savedAt: entry.savedAt })),
      ...[...pending].map(([destination, savedAt]) => ({ destination, savedAt })),
    ]
      .sort((left, right) => left.savedAt - right.savedAt)
      .slice(-MAX_COMPLETED_CREATES_PER_ACCOUNT);
    const retainedDestinations = new Set(merged.map(entry => entry.destination));
    for (const entry of entries) {
      if (!entry.destination || !retainedDestinations.has(entry.destination)) {
        try {
          localStorage.removeItem(entry.key);
        } catch {
          // A failed cleanup must not hide the valid links already read.
        }
      }
    }
    for (const destination of pending.keys()) {
      if (!retainedDestinations.has(destination)) pending.delete(destination);
    }
    const destinations = [...retainedDestinations].filter(
      destination => !removals.has(destination)
    );
    setCompletedCreateSnapshot(
      accountId,
      merged
        .filter(entry => !removals.has(entry.destination))
        .map(entry => [entry.destination, entry.savedAt] as [string, number])
    );
    return destinations;
  } catch {
    setCompletedCreateSnapshot(accountId, [
      ...(completedCreateSnapshots.get(accountId) ?? []),
      ...pending,
    ]);
    return [...(completedCreateSnapshots.get(accountId)?.keys() ?? [])].filter(
      destination => !removals.has(destination)
    );
  }
}

function addCompletedCreate(accountId: string, destination: string): void {
  pendingCompletedCreateRemovals.get(accountId)?.delete(destination);
  try {
    localStorage.setItem(completedCreatesKey(accountId, destination), String(Date.now()));
  } catch {
    const pending = pendingCompletedCreateWrites.get(accountId) ?? new Map<string, number>();
    pending.set(destination, Date.now());
    pendingCompletedCreateWrites.set(accountId, pending);
    prunePendingCreateWrites(accountId);
  }
  readCompletedCreates(accountId);
}

function removeCompletedCreate(accountId: string, destination: string): void {
  pendingCompletedCreateWrites.get(accountId)?.delete(destination);
  completedCreateSnapshots.get(accountId)?.delete(destination);
  try {
    localStorage.removeItem(completedCreatesKey(accountId, destination));
  } catch {
    pendingFor(pendingCompletedCreateRemovals, accountId).add(destination);
  }
}

function onCompletedCreatesStorage(event: StorageEvent): void {
  const changed = event.key && destinationFromKey(event.key);
  if (!changed) return;
  if (event.newValue === null) {
    pendingCompletedCreateWrites.get(changed.accountId)?.delete(changed.destination);
    completedCreateSnapshots.get(changed.accountId)?.delete(changed.destination);
  } else {
    if (pendingCompletedCreateRemovals.get(changed.accountId)?.has(changed.destination)) return;
    const savedAt = Number(event.newValue);
    setCompletedCreateSnapshot(changed.accountId, [
      ...(completedCreateSnapshots.get(changed.accountId) ?? []),
      [changed.destination, Number.isFinite(savedAt) ? savedAt : Date.now()],
    ]);
  }
  for (const listener of completedCreateListeners) {
    listener(changed.accountId, changed.destination);
  }
}

function onCompletedOtherStorage(event: StorageEvent): void {
  if (!event.key?.startsWith(COMPLETED_OTHER_PREFIX) || event.newValue !== '1') return;
  const suffix = event.key.slice(COMPLETED_OTHER_PREFIX.length);
  const separator = suffix.indexOf(':');
  if (separator < 1) return;
  const accountId = suffix.slice(0, separator);
  const collection = suffix.slice(separator + 1);
  if (!collection) return;
  for (const listener of completedOtherCreateListeners) listener(accountId, collection);
}

export function registerSessionDraft(key: string, capture: DraftCapture): () => void {
  activeDrafts.set(key, capture);
  return () => {
    if (activeDrafts.get(key) === capture) activeDrafts.delete(key);
  };
}

export function captureSessionDrafts(accountId: string, token: string): void {
  savedDrafts.clear();
  savedAccountId = accountId;
  recoveryToken = token;
  recoveryPending = true;
  for (const [key, capture] of activeDrafts) {
    try {
      const draft = capture();
      if (draft !== undefined) savedDrafts.set(key, draft);
    } catch {
      // A broken form snapshot must not prevent invalid credentials being cleared.
    }
  }
}

export function takeSessionDraft<T>(key: string, accountId: string): T | undefined {
  if (savedAccountId !== accountId) {
    if (savedAccountId) clearSessionDrafts();
    return undefined;
  }
  const draft = savedDrafts.get(key) as T | undefined;
  savedDrafts.delete(key);
  return draft;
}

export function peekSessionDraft<T>(key: string, accountId: string): T | undefined {
  return savedAccountId === accountId ? (savedDrafts.get(key) as T | undefined) : undefined;
}

export function hasSessionDraft(key: string, accountId: string): boolean {
  return savedAccountId === accountId && savedDrafts.has(key);
}

export function hasPendingSessionRecovery(): boolean {
  return recoveryPending;
}

export function completeSessionRecovery(accountId: string): void {
  if (savedAccountId && savedAccountId !== accountId) clearSessionDrafts();
  if (completedFeedback && completedFeedback.accountId !== accountId) completedFeedback = null;
  recoveryPending = false;
  lastReportedToken = null;
}

export function clearSessionDrafts(): void {
  savedDrafts.clear();
  savedAccountId = null;
  recoveryToken = null;
  lastReportedToken = null;
  recoveryPending = false;
  completedFeedback = null;
}

export function retainSignedOutCreateTokens(accountId: string, tokens: Iterable<string>): void {
  for (const token of tokens) {
    signedOutCreateAccounts.delete(token);
    signedOutCreateAccounts.set(token, accountId);
    if (signedOutCreateAccounts.size > MAX_RETAINED_CREATE_TOKENS) {
      const oldest = signedOutCreateAccounts.keys().next().value;
      if (oldest) signedOutCreateAccounts.delete(oldest);
    }
  }
}

export function recordCompletedSessionFeedback(token: string, feedback: CompletedFeedback): void {
  if (token !== recoveryToken || !savedAccountId) return;
  completedFeedback = { accountId: savedAccountId, ...feedback };
  for (const listener of completedFeedbackListeners) listener(savedAccountId, feedback);
}

export function takeCompletedSessionFeedback(accountId: string): CompletedFeedback | undefined {
  const feedback = peekCompletedSessionFeedback(accountId);
  if (!feedback) return undefined;
  completedFeedback = null;
  return feedback;
}

export function peekCompletedSessionFeedback(accountId: string): CompletedFeedback | undefined {
  if (completedFeedback?.accountId !== accountId) return undefined;
  const { draftId, message, name, email } = completedFeedback;
  return { ...(draftId ? { draftId } : {}), message, name, email };
}

export function subscribeToCompletedSessionFeedback(
  listener: (accountId: string, feedback: CompletedFeedback) => void
): () => void {
  completedFeedbackListeners.add(listener);
  return () => completedFeedbackListeners.delete(listener);
}

export function recordCompletedSessionCreate(token: string, collection: string, id: string): void {
  const accountId = token === recoveryToken ? savedAccountId : signedOutCreateAccounts.get(token);
  if (!accountId || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
  const destination =
    collection === 'projects'
      ? `/projects/${id}`
      : collection === 'coloring_books'
        ? `/coloring/${id}`
        : null;
  if (!destination) {
    pendingFor(completedOtherCreates, accountId).add(collection);
    try {
      localStorage.setItem(completedOtherKey(accountId, collection), '1');
      completedOtherCreates.get(accountId)?.delete(collection);
    } catch {
      // Keep the notice available in this tab when browser storage is unavailable.
    }
    for (const listener of completedOtherCreateListeners) listener(accountId, collection);
    return;
  }
  const destinations = readCompletedCreates(accountId);
  if (destinations.includes(destination)) return;
  addCompletedCreate(accountId, destination);
  for (const listener of completedCreateListeners) listener(accountId, destination);
}

export function takeCompletedSessionOtherCreate(accountId: string): string[] {
  const collections = new Set(completedOtherCreates.get(accountId));
  completedOtherCreates.delete(accountId);
  try {
    const prefix = `${COMPLETED_OTHER_PREFIX}${accountId}:`;
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue;
      collections.add(key.slice(prefix.length));
      localStorage.removeItem(key);
    }
  } catch {
    // Keep collections from this tab available when browser storage is unavailable.
  }
  return [...collections].sort();
}

export function subscribeToCompletedSessionOtherCreate(
  listener: (accountId: string, collection: string) => void
): () => void {
  if (completedOtherCreateListeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', onCompletedOtherStorage);
  }
  completedOtherCreateListeners.add(listener);
  return () => {
    completedOtherCreateListeners.delete(listener);
    if (completedOtherCreateListeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onCompletedOtherStorage);
    }
  };
}

export function ensureCurrentSessionAfterCreate(
  token: string,
  collection: string,
  id: string
): void {
  if (!isSessionTokenInactive(token)) return;
  recordCompletedSessionCreate(token, collection, id);
  throw new SessionChangedError();
}

export function subscribeToCompletedSessionCreate(
  listener: (accountId: string, destination: string) => void
): () => void {
  if (completedCreateListeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', onCompletedCreatesStorage);
  }
  completedCreateListeners.add(listener);
  return () => {
    completedCreateListeners.delete(listener);
    if (completedCreateListeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onCompletedCreatesStorage);
    }
  };
}

export function takeCompletedSessionDestination(accountId: string): string | undefined {
  const destination = readCompletedCreates(accountId)[0];
  if (destination) removeCompletedCreate(accountId, destination);
  return destination;
}

export function takeCompletedSessionDestinations(accountId: string, prefix: string): string[] {
  const matching = readCompletedCreates(accountId).filter(destination =>
    destination.startsWith(prefix)
  );
  for (const destination of matching) removeCompletedCreate(accountId, destination);
  return matching;
}

export function peekCompletedSessionDestinations(accountId: string, prefix: string): string[] {
  return readCompletedCreates(accountId).filter(destination => destination.startsWith(prefix));
}

export function acknowledgeCompletedSessionDestination(
  accountId: string,
  destination: string
): void {
  const destinations = readCompletedCreates(accountId);
  if (!destinations.includes(destination)) return;
  removeCompletedCreate(accountId, destination);
  for (const listener of completedCreateListeners) listener(accountId, destination);
}

export function markSessionTokenInactive(token: string): void {
  if (!token) return;
  inactiveTokens.add(token);
}

export function activateSessionToken(token: string): void {
  inactiveTokens.delete(token);
}

export function isSessionTokenInactive(token: string): boolean {
  return inactiveTokens.has(token);
}

export function reportInvalidSession(token: string): void {
  if (!token || token === lastReportedToken || invalidSessionListeners.size === 0) return;
  lastReportedToken = token;
  for (const listener of invalidSessionListeners) listener(token);
}

export function subscribeToInvalidSession(listener: (token: string) => void): () => void {
  invalidSessionListeners.add(listener);
  return () => invalidSessionListeners.delete(listener);
}
