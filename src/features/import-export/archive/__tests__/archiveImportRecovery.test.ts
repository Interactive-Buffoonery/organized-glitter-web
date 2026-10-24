import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearArchiveImportRecoveryForAccount,
  createArchiveImportRecoveryStore,
} from '../archiveImportRecovery';

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
  it('purges only one account across legacy, partitioned and memory recovery', () => {
    const storage = createStorage();
    const mine = createArchiveImportRecoveryStore('account-a', 'archive', storage);
    const other = createArchiveImportRecoveryStore('account-b', 'archive', storage);
    mine.saveBook('coloring-book:one', { bookId: 'a', pages: {} });
    other.saveBook('coloring-book:one', { bookId: 'b', pages: {} });
    storage.setItem('og:archive-import-recovery:v1:account-a:old', '{}');
    expect(clearArchiveImportRecoveryForAccount('account-a', storage)).toBe(true);
    expect(storage.key(0)).toContain('account-b');
    expect(mine.getBook('coloring-book:one')).toBeUndefined();
    expect(other.getBook('coloring-book:one')?.bookId).toBe('b');
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
});
