import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import {
  createArchiveImportRecoveryStore,
  isPristineGeneratedColoringPage,
} from '../archiveImportRecovery';

it('accepts a new page with a 1 ms timestamp inversion without accepting a later edit', () => {
  const page: ColoringPageDTO = {
    id: 'page-501',
    bookId: 'book-1',
    pageNumber: 501,
    status: 'not_started',
    photos: [],
    mediumIds: [],
    revealedSubject: '',
    revealedAt: '',
    startedAt: '',
    completedAt: '',
    createdAt: '2026-09-23 18:53:30.361Z',
    updatedAt: '2026-09-23 18:53:30.360Z',
  };

  expect(isPristineGeneratedColoringPage(page)).toBe(true);
  expect(
    isPristineGeneratedColoringPage({
      ...page,
      updatedAt: '2026-09-23 18:53:30.362Z',
    })
  ).toBe(false);
});

afterEach(() => vi.restoreAllMocks());

function createStorage() {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
  };
}

describe('completed archive recovery cleanup', () => {
  it('removes expired diamond project checkpoints', () => {
    const storage = createStorage();
    const namespace = 'og:archive-import-recovery:v2:user1:expired-project';
    const key = `${namespace}:project:project%3Aold`;
    storage.setItem(
      key,
      JSON.stringify({
        projectId: 'old-project',
        isArchiveCreated: true,
        creationConfirmed: true,
        tagsRestored: true,
        expiresAt: Date.now() - 1,
      })
    );

    const store = createArchiveImportRecoveryStore('user1', 'different-archive', storage);

    expect(store.getProject('project:old')).toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith(key);
  });

  it('retains an expired checkpoint while tag recovery is incomplete', () => {
    const storage = createStorage();
    const namespace = 'og:archive-import-recovery:v2:user1:unfinished-project';
    storage.setItem(
      `${namespace}:project:project%3Apending`,
      JSON.stringify({
        projectId: 'pending-project',
        isArchiveCreated: true,
        creationConfirmed: true,
        tagsRestored: false,
        expiresAt: Date.now() - 1,
      })
    );

    const store = createArchiveImportRecoveryStore('user1', 'unfinished-project', storage);

    expect(store.getProject('project:pending')).toMatchObject({
      projectId: 'pending-project',
      tagsRestored: false,
    });
  });

  it('does not allocate a namespace when an archive has no checkpoints', () => {
    const setSpy = vi.spyOn(Map.prototype, 'set');
    createArchiveImportRecoveryStore('user1', 'empty-archive', createStorage());
    expect(
      setSpy.mock.calls.some(([key]) => key === 'og:archive-import-recovery:v2:user1:empty-archive')
    ).toBe(false);
    setSpy.mockRestore();
  });

  it('releases the in-memory namespace once all books are durably completed', () => {
    const storage = createStorage();
    const store = createArchiveImportRecoveryStore('user1', 'release-completed', storage);
    store.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    const deleteSpy = vi.spyOn(Map.prototype, 'delete');
    store.completeBook('coloring-book:one');
    expect(deleteSpy).toHaveBeenCalledWith('og:archive-import-recovery:v2:user1:release-completed');
    expect(storage.length).toBe(0);
    deleteSpy.mockRestore();
  });

  it('does not resurrect a completed book when storage cleanup fails', () => {
    const storage = createStorage();
    const store = createArchiveImportRecoveryStore('user1', 'failed-cleanup', storage);
    store.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    storage.removeItem.mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    store.completeBook('coloring-book:one');
    expect(
      createArchiveImportRecoveryStore('user1', 'failed-cleanup', storage).getBook(
        'coloring-book:one'
      )
    ).toBeUndefined();
  });
  it('keeps older handles synchronized after a namespace is released and reused', () => {
    const storage = createStorage();
    const oldStore = createArchiveImportRecoveryStore('user1', 'reused', storage);
    oldStore.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    oldStore.completeBook('coloring-book:one');
    const newStore = createArchiveImportRecoveryStore('user1', 'reused', storage);
    newStore.saveBook('coloring-book:two', { bookId: 'book2', pages: {} });
    oldStore.saveBook('coloring-book:three', { bookId: 'book3', pages: {} });
    expect(newStore.getBook('coloring-book:three')?.bookId).toBe('book3');
    expect(oldStore.getBook('coloring-book:two')?.bookId).toBe('book2');
  });

  it('retains failed cleanup protection when a later book completes successfully', () => {
    const storage = createStorage();
    const store = createArchiveImportRecoveryStore('user1', 'partial-cleanup', storage);
    store.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    store.saveBook('coloring-book:two', { bookId: 'book2', pages: {} });
    storage.removeItem.mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    store.completeBook('coloring-book:one');
    store.completeBook('coloring-book:two');
    expect(
      createArchiveImportRecoveryStore('user1', 'partial-cleanup', storage).getBook(
        'coloring-book:one'
      )
    ).toBeUndefined();
  });
  it('keeps completed partitioned checkpoints suppressed after a reload when cleanup fails', async () => {
    const storage = createStorage();
    const store = createArchiveImportRecoveryStore('user1', 'reload-cleanup', storage);
    store.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    store.saveBook('coloring-book:pending', { bookId: 'pending', pages: {} });
    storage.removeItem.mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    store.completeBook('coloring-book:one');
    vi.resetModules();
    const { createArchiveImportRecoveryStore: reload } = await import('../archiveImportRecovery');
    const reloaded = reload('user1', 'reload-cleanup', storage);
    expect(reloaded.getBook('coloring-book:one')).toBeUndefined();
    expect(reloaded.getBook('coloring-book:pending')?.bookId).toBe('pending');
  });

  it('preserves completion markers during legacy migration while stale partitioned books remain', async () => {
    const storage = createStorage();
    const namespace = 'og:archive-import-recovery:v2:user1:marker-migration';
    storage.setItem(`${namespace}:book:coloring-book%3Aone`, JSON.stringify({ bookId: 'book1' }));
    storage.setItem(`${namespace}:completed:coloring-book%3Aone`, '1');
    storage.setItem(
      'og:archive-import-recovery:v1:user1:marker-migration',
      JSON.stringify({
        books: { 'coloring-book:pending': { bookId: 'pending', pages: {} } },
      })
    );
    createArchiveImportRecoveryStore('user1', 'marker-migration', storage);
    vi.resetModules();
    const { createArchiveImportRecoveryStore: reload } = await import('../archiveImportRecovery');
    const reloaded = reload('user1', 'marker-migration', storage);
    expect(reloaded.getBook('coloring-book:one')).toBeUndefined();
    expect(reloaded.getBook('coloring-book:pending')?.bookId).toBe('pending');
  });
  it('still removes stale checkpoints when writing a completion marker fails', async () => {
    const storage = createStorage();
    const store = createArchiveImportRecoveryStore('user1', 'marker-quota', storage);
    store.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    store.completeBook('coloring-book:one');
    vi.resetModules();
    const { createArchiveImportRecoveryStore: reload } = await import('../archiveImportRecovery');
    expect(reload('user1', 'marker-quota', storage).getBook('coloring-book:one')).toBeUndefined();
  });
  it('keeps current-session completion when marker writes and removal both fail', () => {
    const storage = createStorage();
    const store = createArchiveImportRecoveryStore('user1', 'storage-unavailable', storage);
    store.saveBook('coloring-book:one', { bookId: 'book1', pages: {} });
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    storage.removeItem.mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    store.completeBook('coloring-book:one');
    expect(
      createArchiveImportRecoveryStore('user1', 'storage-unavailable', storage).getBook(
        'coloring-book:one'
      )
    ).toBeUndefined();
  });
});
