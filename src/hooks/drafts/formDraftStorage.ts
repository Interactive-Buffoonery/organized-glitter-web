const DRAFT_PREFIX = 'og:form-draft:v1:';
const GENERATION_PREFIX = 'og:form-draft-generation:v1:';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type DraftKind = 'project-new' | 'project-edit' | 'coloring-book-new' | 'coloring-book-edit';

export interface DraftIdentity {
  backendUrl: string;
  accountId: string;
  kind: DraftKind;
  recordId?: string;
}

export interface DraftEnvelope<T> {
  version: 1;
  kind: DraftKind;
  savedAt: number;
  generation: string;
  baselineUpdatedAt?: string;
  values: T;
}

function namespaceOf(identity: Pick<DraftIdentity, 'backendUrl' | 'accountId'>): string {
  const input = `${identity.backendUrl.replace(/\/+$/, '')}\n${identity.accountId}`;
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

const draftKey = (identity: DraftIdentity) =>
  `${DRAFT_PREFIX}${namespaceOf(identity)}:${identity.kind}:${identity.recordId ?? 'new'}`;
const generationKey = (identity: Pick<DraftIdentity, 'backendUrl' | 'accountId'>) =>
  `${GENERATION_PREFIX}${namespaceOf(identity)}`;

interface ActiveEditor {
  generation: string;
  retire: () => void;
  flush: () => void;
  hasChanges: () => boolean;
}
const activeEditors = new Map<string, Set<ActiveEditor>>();
const writtenKeys = new Map<string, Map<string, Set<string>>>();
let listening = false;

function rememberWrite(generationKeyValue: string, generation: string, key: string) {
  const generations = writtenKeys.get(generationKeyValue) ?? new Map<string, Set<string>>();
  const keys = generations.get(generation) ?? new Set<string>();
  keys.add(key);
  generations.set(generation, keys);
  writtenKeys.set(generationKeyValue, generations);
}

function removeIfGeneration(key: string, generation: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    const value = JSON.parse(raw) as Partial<DraftEnvelope<unknown>>;
    if (value.generation === generation) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function retireInThisTab(marker: string, oldGeneration: string) {
  activeEditors.get(marker)?.forEach(editor => {
    if (editor.generation === oldGeneration) editor.retire();
  });
  const generations = writtenKeys.get(marker);
  generations?.get(oldGeneration)?.forEach(key => removeIfGeneration(key, oldGeneration));
  generations?.delete(oldGeneration);
  if (generations?.size === 0) writtenKeys.delete(marker);
}

function ensureStorageListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', event => {
    if (!event.key?.startsWith(GENERATION_PREFIX) || !event.oldValue) return;
    if (event.newValue === event.oldValue) return;
    retireInThisTab(event.key, event.oldValue);
  });
}

export function registerDraftEditor(
  identity: DraftIdentity,
  generation: string,
  retire: () => void,
  flush: () => void,
  hasChanges: () => boolean
): () => void {
  ensureStorageListener();
  const marker = generationKey(identity);
  const editors = activeEditors.get(marker) ?? new Set<ActiveEditor>();
  const editor = { generation, retire, flush, hasChanges };
  editors.add(editor);
  activeEditors.set(marker, editors);
  return () => {
    editors.delete(editor);
    if (editors.size === 0) activeEditors.delete(marker);
  };
}

export function getDraftGeneration(identity: DraftIdentity): string | null {
  ensureStorageListener();
  try {
    const marker = generationKey(identity);
    const existing = localStorage.getItem(marker);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(marker, generated);
    return localStorage.getItem(marker) === generated ? generated : null;
  } catch {
    return null;
  }
}

export function readFormDraft<T>(
  identity: DraftIdentity,
  generation: string,
  validate: (value: unknown) => value is T
): { draft: DraftEnvelope<T> | null; storageFailed: boolean } {
  const key = draftKey(identity);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { draft: null, storageFailed: false };
    let value: Partial<DraftEnvelope<unknown>>;
    try {
      value = JSON.parse(raw) as Partial<DraftEnvelope<unknown>>;
    } catch {
      localStorage.removeItem(key);
      return { draft: null, storageFailed: false };
    }
    if (
      !value ||
      value.version !== 1 ||
      value.kind !== identity.kind ||
      value.generation !== generation ||
      typeof value.savedAt !== 'number' ||
      value.savedAt > Date.now() ||
      Date.now() - value.savedAt > MAX_AGE_MS ||
      !validate(value.values)
    ) {
      localStorage.removeItem(key);
      return { draft: null, storageFailed: false };
    }
    return { draft: value as DraftEnvelope<T>, storageFailed: false };
  } catch {
    return { draft: null, storageFailed: true };
  }
}

export function writeFormDraft<T>(
  identity: DraftIdentity,
  generation: string,
  values: T,
  baselineUpdatedAt?: string
): boolean {
  const key = draftKey(identity);
  try {
    const marker = generationKey(identity);
    if (localStorage.getItem(marker) !== generation) return false;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        kind: identity.kind,
        generation,
        savedAt: Date.now(),
        baselineUpdatedAt,
        values,
      } satisfies DraftEnvelope<T>)
    );
    rememberWrite(marker, generation, key);
    if (localStorage.getItem(marker) !== generation) {
      removeIfGeneration(key, generation);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function removeFormDraft(identity: DraftIdentity): boolean {
  try {
    localStorage.removeItem(draftKey(identity));
    return localStorage.getItem(draftKey(identity)) === null;
  } catch {
    return false;
  }
}

export function hasAccountDrafts(
  identity: Pick<DraftIdentity, 'backendUrl' | 'accountId'>
): boolean {
  try {
    const prefix = `${DRAFT_PREFIX}${namespaceOf(identity)}:`;
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some(
      key => key?.startsWith(prefix)
    );
  } catch {
    return false;
  }
}

export function checkpointAccountDrafts(
  identity: Pick<DraftIdentity, 'backendUrl' | 'accountId'>
): boolean {
  let hasChanges = false;
  activeEditors.get(generationKey(identity))?.forEach(editor => {
    try {
      hasChanges = editor.hasChanges() || hasChanges;
    } catch {
      hasChanges = true;
    }
    try {
      editor.flush();
    } catch {
      // Warn about a failed checkpoint and continue flushing other editors.
      hasChanges = true;
    }
  });
  return hasChanges;
}

export function clearAccountDrafts(
  identity: Pick<DraftIdentity, 'backendUrl' | 'accountId'>
): boolean {
  ensureStorageListener();
  const marker = generationKey(identity);
  let rotated = false;
  let retiredOldEditors = false;
  try {
    const previous = localStorage.getItem(marker);
    const replacement = crypto.randomUUID();
    localStorage.setItem(marker, replacement);
    rotated = localStorage.getItem(marker) === replacement;
    if (previous) {
      retireInThisTab(marker, previous);
      retiredOldEditors = true;
    }
  } catch {
    rotated = false;
  } finally {
    // Sign-out must retire this tab even when browser storage fails.
    if (!retiredOldEditors) activeEditors.get(marker)?.forEach(editor => editor.retire());
  }
  try {
    const prefix = `${DRAFT_PREFIX}${namespaceOf(identity)}:`;
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    keys
      .filter(key => key?.startsWith(prefix))
      .forEach(key => {
        try {
          localStorage.removeItem(key!);
        } catch {
          // Continue clearing the remaining drafts.
        }
      });
    return rotated && !hasAccountDrafts(identity);
  } catch {
    return false;
  }
}
