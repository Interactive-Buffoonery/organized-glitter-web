import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type {
  ArchiveColoringBook,
  ArchiveColoringPage,
  ArchiveDiamondProject,
} from '@/features/import-export/archive/types';

const LEGACY_RECOVERY_STORAGE_PREFIX = 'og:archive-import-recovery:v1';
const RECOVERY_STORAGE_PREFIX = 'og:archive-import-recovery:v2';
const PROJECT_RECOVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const inMemoryRecovery = new Map<string, ArchiveImportRecoveryState>();

export interface ColoringPageMetadataSnapshot {
  status: ColoringPageDTO['status'];
  mediumIds: string[];
  revealedSubject: string;
  revealedAt: string;
  startedAt: string;
  completedAt: string;
  updatedAt?: string;
}

export interface ColoringPageRecoveryCheckpoint {
  pageId: string;
  baseline: ColoringPageMetadataSnapshot;
  intended: ColoringPageMetadataSnapshot;
}

export interface ColoringBookRecoveryCheckpoint {
  bookId: string;
  pages: Partial<Record<ArchiveColoringPage['ref'], ColoringPageRecoveryCheckpoint>>;
}

export interface DiamondProjectRecoveryCheckpoint {
  projectId: string;
  isArchiveCreated: boolean;
  creationConfirmed: boolean;
  tagsRestored: boolean;
  expiresAt?: number;
}

interface ArchiveImportRecoveryState {
  hasFailedCleanup?: boolean;
  books: Partial<Record<ArchiveColoringBook['ref'], ColoringBookRecoveryCheckpoint>>;
  projects: Partial<Record<ArchiveDiamondProject['ref'], DiamondProjectRecoveryCheckpoint>>;
}

interface PartitionedRecoveryData {
  state: ArchiveImportRecoveryState | null;
  completedBookRefs: Set<ArchiveColoringBook['ref']>;
}

export interface ArchiveImportRecoveryStore {
  getProject(
    projectRef: ArchiveDiamondProject['ref']
  ): DiamondProjectRecoveryCheckpoint | undefined;
  saveProject(
    projectRef: ArchiveDiamondProject['ref'],
    checkpoint: DiamondProjectRecoveryCheckpoint
  ): void;
  getBook(bookRef: ArchiveColoringBook['ref']): ColoringBookRecoveryCheckpoint | undefined;
  saveBook(bookRef: ArchiveColoringBook['ref'], checkpoint: ColoringBookRecoveryCheckpoint): void;
  completePage(bookRef: ArchiveColoringBook['ref'], pageRef: ArchiveColoringPage['ref']): void;
  completeBook(bookRef: ArchiveColoringBook['ref']): void;
}

function normalizedIds(ids: string[]): string[] {
  return [...ids].sort();
}

export function snapshotCurrentColoringPage(page: ColoringPageDTO): ColoringPageMetadataSnapshot {
  return {
    status: page.status,
    mediumIds: normalizedIds(page.mediumIds),
    revealedSubject: page.revealedSubject,
    revealedAt: page.revealedAt,
    startedAt: page.startedAt,
    completedAt: page.completedAt,
    updatedAt: page.updatedAt,
  };
}

export function snapshotArchivedColoringPage(
  page: ArchiveColoringPage,
  mediumIds: string[]
): ColoringPageMetadataSnapshot {
  return {
    status: page.status,
    mediumIds: normalizedIds(mediumIds),
    revealedSubject: page.revealedSubject ?? '',
    revealedAt: page.revealedAt ?? '',
    startedAt: page.startedAt ?? '',
    completedAt: page.completedAt ?? '',
  };
}

export function coloringPageMetadataMatches(
  current: ColoringPageMetadataSnapshot,
  expected: ColoringPageMetadataSnapshot
): boolean {
  return (
    current.status === expected.status &&
    normalizedIds(current.mediumIds).join('\0') === normalizedIds(expected.mediumIds).join('\0') &&
    current.revealedSubject === expected.revealedSubject &&
    current.revealedAt === expected.revealedAt &&
    current.startedAt === expected.startedAt &&
    current.completedAt === expected.completedAt
  );
}

function clonePageCheckpoint(
  checkpoint: ColoringPageRecoveryCheckpoint
): ColoringPageRecoveryCheckpoint {
  return {
    pageId: checkpoint.pageId,
    baseline: { ...checkpoint.baseline, mediumIds: [...checkpoint.baseline.mediumIds] },
    intended: { ...checkpoint.intended, mediumIds: [...checkpoint.intended.mediumIds] },
  };
}

function cloneBookCheckpoint(
  checkpoint: ColoringBookRecoveryCheckpoint
): ColoringBookRecoveryCheckpoint {
  const pages: ColoringBookRecoveryCheckpoint['pages'] = {};
  for (const [pageRef, pageCheckpoint] of Object.entries(checkpoint.pages) as Array<
    [ArchiveColoringPage['ref'], ColoringPageRecoveryCheckpoint | undefined]
  >) {
    if (pageCheckpoint) pages[pageRef] = clonePageCheckpoint(pageCheckpoint);
  }
  return {
    bookId: checkpoint.bookId,
    pages,
  };
}

export function isPristineGeneratedColoringPage(page: ColoringPageDTO): boolean {
  // PocketBase can stamp a new page's created time 1 ms after its updated time.
  // A later updated time indicates a subsequent write that must be preserved.
  return (
    (page.createdAt === page.updatedAt ||
      Date.parse(page.updatedAt) < Date.parse(page.createdAt)) &&
    coloringPageMetadataMatches(snapshotCurrentColoringPage(page), {
      status: 'not_started',
      mediumIds: [],
      revealedSubject: '',
      revealedAt: '',
      startedAt: '',
      completedAt: '',
    })
  );
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStoredMetadataSnapshot(
  value: unknown,
  requiresUpdatedAt: boolean
): value is ColoringPageMetadataSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return (
    ['not_started', 'palette_chosen', 'in_progress', 'on_hold', 'completed'].includes(
      String(snapshot.status)
    ) &&
    Array.isArray(snapshot.mediumIds) &&
    snapshot.mediumIds.every(id => typeof id === 'string' && id !== '') &&
    typeof snapshot.revealedSubject === 'string' &&
    typeof snapshot.revealedAt === 'string' &&
    typeof snapshot.startedAt === 'string' &&
    typeof snapshot.completedAt === 'string' &&
    (!requiresUpdatedAt || (typeof snapshot.updatedAt === 'string' && snapshot.updatedAt !== ''))
  );
}

function parseRecoveryState(value: string | null): ArchiveImportRecoveryState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.books ||
      typeof parsed.books !== 'object'
    ) {
      return null;
    }
    for (const bookValue of Object.values(parsed.books as Record<string, unknown>)) {
      const book = bookValue as Record<string, unknown>;
      if (
        !book ||
        typeof book !== 'object' ||
        typeof book.bookId !== 'string' ||
        !book.pages ||
        typeof book.pages !== 'object'
      ) {
        return null;
      }
      for (const pageValue of Object.values(book.pages as Record<string, unknown>)) {
        const page = pageValue as Record<string, unknown>;
        const baseline = page.baseline as Record<string, unknown> | undefined;
        const intended = page.intended as Record<string, unknown> | undefined;
        if (
          !page ||
          typeof page !== 'object' ||
          typeof page.pageId !== 'string' ||
          page.pageId === '' ||
          !isStoredMetadataSnapshot(baseline, true) ||
          !isStoredMetadataSnapshot(intended, false)
        ) {
          return null;
        }
      }
    }
    return {
      hasFailedCleanup: Boolean(parsed.hasFailedCleanup),
      books: parsed.books as ArchiveImportRecoveryState['books'],
      projects: {},
    };
  } catch {
    return null;
  }
}

function parseProjectCheckpoint(value: string | null): DiamondProjectRecoveryCheckpoint | null {
  if (!value) return null;
  try {
    const project = JSON.parse(value) as Record<string, unknown>;
    if (
      !project ||
      typeof project !== 'object' ||
      typeof project.projectId !== 'string' ||
      project.projectId === '' ||
      typeof project.isArchiveCreated !== 'boolean' ||
      typeof project.creationConfirmed !== 'boolean' ||
      typeof project.tagsRestored !== 'boolean' ||
      typeof project.expiresAt !== 'number' ||
      !Number.isFinite(project.expiresAt) ||
      (project.tagsRestored && project.expiresAt <= Date.now())
    ) {
      return null;
    }
    return project as unknown as DiamondProjectRecoveryCheckpoint;
  } catch {
    return null;
  }
}

function parseBookIdentity(value: string | null): { bookId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed.bookId === 'string' ? { bookId: parsed.bookId } : null;
  } catch {
    return null;
  }
}

function parsePageCheckpoint(value: string | null): ColoringPageRecoveryCheckpoint | null {
  if (!value) return null;
  try {
    const page = JSON.parse(value) as Record<string, unknown>;
    if (
      !page ||
      typeof page !== 'object' ||
      typeof page.pageId !== 'string' ||
      page.pageId === '' ||
      !isStoredMetadataSnapshot(page.baseline, true) ||
      !isStoredMetadataSnapshot(page.intended, false)
    ) {
      return null;
    }
    return page as unknown as ColoringPageRecoveryCheckpoint;
  } catch {
    return null;
  }
}

function readPartitionedRecoveryState(
  storage: Storage | null,
  storageNamespace: string,
  userStoragePrefix: string
): PartitionedRecoveryData {
  if (!storage || typeof storage.key !== 'function' || typeof storage.length !== 'number') {
    return { state: null, completedBookRefs: new Set() };
  }
  const bookKeyPrefix = `${storageNamespace}:book:`;
  const projectKeyPrefix = `${storageNamespace}:project:`;
  const pageKeyPrefix = `${storageNamespace}:page:`;
  const completedBookKeyPrefix = `${storageNamespace}:completed:`;
  const books: ArchiveImportRecoveryState['books'] = Object.create(null);
  const projects: ArchiveImportRecoveryState['projects'] = Object.create(null);
  const staleProjectKeys: string[] = [];
  const completedBookRefs = new Set<ArchiveColoringBook['ref']>();
  const pageEntries: Array<
    [ArchiveColoringBook['ref'], ArchiveColoringPage['ref'], ColoringPageRecoveryCheckpoint]
  > = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const anyProjectSeparator = key.indexOf(':project:', userStoragePrefix.length);
      if (key.startsWith(userStoragePrefix) && anyProjectSeparator >= 0) {
        const checkpoint = parseProjectCheckpoint(storage.getItem(key));
        if (!checkpoint) staleProjectKeys.push(key);
        if (!key.startsWith(projectKeyPrefix)) continue;
      }
      if (key.startsWith(completedBookKeyPrefix)) {
        completedBookRefs.add(
          decodeURIComponent(key.slice(completedBookKeyPrefix.length)) as ArchiveColoringBook['ref']
        );
        continue;
      }
      if (key.startsWith(projectKeyPrefix)) {
        const projectRef = decodeURIComponent(
          key.slice(projectKeyPrefix.length)
        ) as ArchiveDiamondProject['ref'];
        const checkpoint = parseProjectCheckpoint(storage.getItem(key));
        if (checkpoint) projects[projectRef] = checkpoint;
        continue;
      }
      if (key.startsWith(bookKeyPrefix)) {
        const bookRef = decodeURIComponent(
          key.slice(bookKeyPrefix.length)
        ) as ArchiveColoringBook['ref'];
        const identity = parseBookIdentity(storage.getItem(key));
        if (identity) books[bookRef] = { ...identity, pages: {} };
        continue;
      }
      if (!key.startsWith(pageKeyPrefix)) continue;
      const encodedRefs = key.slice(pageKeyPrefix.length);
      const separatorIndex = encodedRefs.indexOf(':');
      if (separatorIndex < 0) continue;
      const bookRef = decodeURIComponent(
        encodedRefs.slice(0, separatorIndex)
      ) as ArchiveColoringBook['ref'];
      const pageRef = decodeURIComponent(
        encodedRefs.slice(separatorIndex + 1)
      ) as ArchiveColoringPage['ref'];
      const checkpoint = parsePageCheckpoint(storage.getItem(key));
      if (checkpoint) pageEntries.push([bookRef, pageRef, checkpoint]);
    }
  } catch {
    return { state: null, completedBookRefs: new Set() };
  }

  for (const key of staleProjectKeys) {
    try {
      storage.removeItem(key);
    } catch {
      break;
    }
  }

  for (const [bookRef, pageRef, checkpoint] of pageEntries) {
    const book = books[bookRef];
    if (book && !completedBookRefs.has(bookRef)) book.pages[pageRef] = checkpoint;
  }
  for (const bookRef of completedBookRefs) delete books[bookRef];
  return {
    state:
      Object.keys(books).length > 0 || Object.keys(projects).length > 0
        ? { books, projects }
        : null,
    completedBookRefs,
  };
}

export function createArchiveImportRecoveryStore(
  userId: string,
  archiveFingerprint: string,
  storage: Storage | null = getLocalStorage()
): ArchiveImportRecoveryStore {
  const encodedUserId = encodeURIComponent(userId);
  const userStoragePrefix = `${RECOVERY_STORAGE_PREFIX}:${encodedUserId}:`;
  const storageNamespace = `${RECOVERY_STORAGE_PREFIX}:${encodedUserId}:${archiveFingerprint}`;
  const legacyStorageKey = `${LEGACY_RECOVERY_STORAGE_PREFIX}:${encodedUserId}:${archiveFingerprint}`;
  const bookStorageKey = (bookRef: ArchiveColoringBook['ref']) =>
    `${storageNamespace}:book:${encodeURIComponent(bookRef)}`;
  const projectStorageKey = (projectRef: ArchiveDiamondProject['ref']) =>
    `${storageNamespace}:project:${encodeURIComponent(projectRef)}`;
  const pageStorageKey = (
    bookRef: ArchiveColoringBook['ref'],
    pageRef: ArchiveColoringPage['ref']
  ) => `${storageNamespace}:page:${encodeURIComponent(bookRef)}:${encodeURIComponent(pageRef)}`;
  const completedBookStorageKey = (bookRef: ArchiveColoringBook['ref']) =>
    `${storageNamespace}:completed:${encodeURIComponent(bookRef)}`;

  const partitionedData = readPartitionedRecoveryState(
    storage,
    storageNamespace,
    userStoragePrefix
  );
  const partitionedState = partitionedData.state;
  const legacyState = (() => {
    try {
      return parseRecoveryState(storage?.getItem(legacyStorageKey) ?? null);
    } catch {
      return null;
    }
  })();
  const storedState: ArchiveImportRecoveryState | null =
    legacyState || partitionedState
      ? {
          projects: partitionedState?.projects ?? Object.create(null),
          books: {
            ...Object.fromEntries(
              Object.entries(legacyState?.books ?? {}).filter(
                ([bookRef]) =>
                  !partitionedData.completedBookRefs.has(bookRef as ArchiveColoringBook['ref'])
              )
            ),
            ...(partitionedState?.books ?? {}),
          },
        }
      : null;

  if (storage && legacyState) {
    let migratedAllBooks = true;
    for (const [bookRef, checkpoint] of Object.entries(legacyState.books) as Array<
      [ArchiveColoringBook['ref'], ColoringBookRecoveryCheckpoint]
    >) {
      if (partitionedData.completedBookRefs.has(bookRef)) continue;
      if (partitionedState?.books[bookRef]) continue;
      try {
        for (const [pageRef, pageCheckpoint] of Object.entries(checkpoint.pages) as Array<
          [ArchiveColoringPage['ref'], ColoringPageRecoveryCheckpoint]
        >) {
          storage.setItem(pageStorageKey(bookRef, pageRef), JSON.stringify(pageCheckpoint));
        }
        storage.setItem(bookStorageKey(bookRef), JSON.stringify({ bookId: checkpoint.bookId }));
      } catch {
        migratedAllBooks = false;
        break;
      }
    }
    if (migratedAllBooks) {
      try {
        storage.removeItem(legacyStorageKey);
        for (const bookRef of partitionedData.completedBookRefs) {
          if (storage.getItem(bookStorageKey(bookRef)) === null) {
            storage.removeItem(completedBookStorageKey(bookRef));
          }
        }
      } catch {
        // The complete partitioned state takes precedence on reload.
      }
    }
  }

  let state: ArchiveImportRecoveryState = inMemoryRecovery.get(storageNamespace) ??
    storedState ?? { books: {}, projects: Object.create(null) };
  state.projects ??= Object.create(null);
  for (const [namespace, recoveryState] of inMemoryRecovery) {
    if (!namespace.startsWith(userStoragePrefix)) continue;
    for (const [projectRef, checkpoint] of Object.entries(recoveryState.projects)) {
      if (checkpoint?.tagsRestored && checkpoint.expiresAt && checkpoint.expiresAt <= Date.now()) {
        delete recoveryState.projects[projectRef as ArchiveDiamondProject['ref']];
      }
    }
    if (
      !recoveryState.hasFailedCleanup &&
      Object.keys(recoveryState.books).length === 0 &&
      Object.keys(recoveryState.projects).length === 0
    ) {
      inMemoryRecovery.delete(namespace);
    }
  }
  if (
    state.hasFailedCleanup ||
    Object.keys(state.books).length > 0 ||
    Object.keys(state.projects).length > 0
  ) {
    inMemoryRecovery.set(storageNamespace, state);
  }

  let canPersistProjects = Boolean(storage);

  return {
    getProject(projectRef) {
      state = inMemoryRecovery.get(storageNamespace) ?? state;
      if (!Object.prototype.hasOwnProperty.call(state.projects, projectRef)) return undefined;
      const project = state.projects[projectRef];
      if (project?.tagsRestored && project.expiresAt && project.expiresAt <= Date.now()) {
        delete state.projects[projectRef];
        try {
          storage?.removeItem(projectStorageKey(projectRef));
        } catch {
          // The expired checkpoint is already removed from this page session.
        }
        return undefined;
      }
      return project ? { ...project } : undefined;
    },
    saveProject(projectRef, checkpoint) {
      state = inMemoryRecovery.get(storageNamespace) ?? state;
      const storedCheckpoint = {
        ...checkpoint,
        expiresAt: Date.now() + PROJECT_RECOVERY_RETENTION_MS,
      };
      state.projects[projectRef] = storedCheckpoint;
      inMemoryRecovery.set(storageNamespace, state);
      if (!canPersistProjects) return;
      try {
        storage?.setItem(projectStorageKey(projectRef), JSON.stringify(storedCheckpoint));
      } catch {
        canPersistProjects = false;
        // The in-memory checkpoint still supports retries in this page session.
      }
    },
    getBook(bookRef) {
      state = inMemoryRecovery.get(storageNamespace) ?? state;
      const book = state.books[bookRef];
      return book ? cloneBookCheckpoint(book) : undefined;
    },
    saveBook(bookRef, checkpoint) {
      state = inMemoryRecovery.get(storageNamespace) ?? state;
      const previousPages = state.books[bookRef]?.pages ?? {};
      const storedCheckpoint = cloneBookCheckpoint(checkpoint);
      state.books[bookRef] = storedCheckpoint;
      inMemoryRecovery.set(storageNamespace, state);
      try {
        for (const [pageRef, pageCheckpoint] of Object.entries(storedCheckpoint.pages) as Array<
          [ArchiveColoringPage['ref'], ColoringPageRecoveryCheckpoint]
        >) {
          storage?.setItem(pageStorageKey(bookRef, pageRef), JSON.stringify(pageCheckpoint));
        }
        for (const pageRef of Object.keys(previousPages) as ArchiveColoringPage['ref'][]) {
          if (!storedCheckpoint.pages[pageRef]) {
            storage?.removeItem(pageStorageKey(bookRef, pageRef));
          }
        }
        storage?.setItem(
          bookStorageKey(bookRef),
          JSON.stringify({ bookId: storedCheckpoint.bookId })
        );
        storage?.removeItem(completedBookStorageKey(bookRef));
      } catch {
        // The in-memory checkpoint still supports retries in this page session.
      }
    },
    completePage(bookRef, pageRef) {
      state = inMemoryRecovery.get(storageNamespace) ?? state;
      const book = state.books[bookRef];
      if (!book) return;

      delete book.pages[pageRef];
      inMemoryRecovery.set(storageNamespace, state);
      try {
        storage?.removeItem(pageStorageKey(bookRef, pageRef));
      } catch {
        // The in-memory checkpoint still supports retries in this page session.
      }
    },
    completeBook(bookRef) {
      state = inMemoryRecovery.get(storageNamespace) ?? state;
      const book = state.books[bookRef];
      if (!book) return;
      delete state.books[bookRef];
      inMemoryRecovery.set(storageNamespace, state);
      try {
        storage?.setItem(completedBookStorageKey(bookRef), '1');
      } catch {
        state.hasFailedCleanup = true;
      }
      try {
        for (const pageRef of Object.keys(book.pages) as ArchiveColoringPage['ref'][]) {
          storage?.removeItem(pageStorageKey(bookRef, pageRef));
        }
        storage?.removeItem(bookStorageKey(bookRef));
        if (!parseRecoveryState(storage?.getItem(legacyStorageKey) ?? null)?.books[bookRef]) {
          storage?.removeItem(completedBookStorageKey(bookRef));
        }
      } catch {
        // Retain completion state so failed storage cleanup cannot resurrect a book.
        state.hasFailedCleanup = true;
      }
      if (
        !state.hasFailedCleanup &&
        Object.keys(state.books).length === 0 &&
        Object.keys(state.projects).length === 0
      ) {
        inMemoryRecovery.delete(storageNamespace);
      }
    },
  };
}

export async function fingerprintArchiveManifest(manifestJson: string): Promise<string> {
  const bytes = new TextEncoder().encode(manifestJson);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function deriveArchiveColoringBookId(
  userId: string,
  archiveFingerprint: string,
  archiveBookRef: ArchiveColoringBook['ref']
): Promise<string> {
  const identity = `${userId}\0${archiveFingerprint}\0${archiveBookRef}`;
  return (await fingerprintArchiveManifest(identity)).slice(0, 15);
}
