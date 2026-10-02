import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAccountDrafts,
  checkpointAccountDrafts,
  getDraftGeneration,
  hasAccountDrafts,
  readFormDraft,
  registerDraftEditor,
  writeFormDraft,
  type DraftIdentity,
} from './formDraftStorage';

const identity: DraftIdentity = {
  backendUrl: 'https://data.example.test',
  accountId: 'account-a',
  kind: 'project-new',
};
const isDraft = (value: unknown): value is { title: string } =>
  !!value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string';

beforeEach(() => {
  localStorage.clear();
});

describe('local form draft storage', () => {
  it('keeps drafts inside their account and backend namespace', () => {
    const generation = getDraftGeneration(identity)!;
    expect(writeFormDraft(identity, generation, { title: 'Unfinished' })).toBe(true);
    expect(readFormDraft(identity, generation, isDraft).draft?.values.title).toBe('Unfinished');
    expect(
      readFormDraft(
        { ...identity, accountId: 'account-b' },
        getDraftGeneration({ ...identity, accountId: 'account-b' })!,
        isDraft
      ).draft
    ).toBeNull();
    expect(
      readFormDraft(
        { ...identity, backendUrl: 'https://other.example.test' },
        getDraftGeneration({ ...identity, backendUrl: 'https://other.example.test' })!,
        isDraft
      ).draft
    ).toBeNull();
  });

  it('retires old writers before clearing drafts on sign-out', () => {
    const generation = getDraftGeneration(identity)!;
    const retire = vi.fn();
    const unregister = registerDraftEditor(identity, generation, retire, vi.fn(), () => true);
    expect(writeFormDraft(identity, generation, { title: 'Unfinished' })).toBe(true);

    expect(clearAccountDrafts(identity)).toBe(true);
    expect(retire).toHaveBeenCalledOnce();
    expect(hasAccountDrafts(identity)).toBe(false);
    expect(writeFormDraft(identity, generation, { title: 'Too late' })).toBe(false);
    expect(hasAccountDrafts(identity)).toBe(false);
    unregister();
  });

  it('continues checkpointing other editors when one editor throws', () => {
    const generation = getDraftGeneration(identity)!;
    const firstFlush = vi.fn(() => {
      throw new Error('Storage blocked');
    });
    const secondFlush = vi.fn();
    const unregisterFirst = registerDraftEditor(
      identity,
      generation,
      vi.fn(),
      firstFlush,
      () => true
    );
    const unregisterSecond = registerDraftEditor(
      identity,
      generation,
      vi.fn(),
      secondFlush,
      () => true
    );

    expect(checkpointAccountDrafts(identity)).toBe(true);
    expect(firstFlush).toHaveBeenCalledOnce();
    expect(secondFlush).toHaveBeenCalledOnce();
    unregisterFirst();
    unregisterSecond();
  });

  it('rejects a stale-generation draft written by a delayed second tab', () => {
    const generation = getDraftGeneration(identity)!;
    expect(clearAccountDrafts(identity)).toBe(true);
    const currentGeneration = getDraftGeneration(identity)!;
    expect(currentGeneration).not.toBe(generation);
    expect(writeFormDraft(identity, generation, { title: 'Old tab' })).toBe(false);
    expect(readFormDraft(identity, currentGeneration, isDraft).draft).toBeNull();
  });

  it('keeps a new-generation editor active when an old storage event arrives late', () => {
    const oldGeneration = getDraftGeneration(identity)!;
    expect(clearAccountDrafts(identity)).toBe(true);
    const currentGeneration = getDraftGeneration(identity)!;
    const retire = vi.fn();
    const unregister = registerDraftEditor(
      identity,
      currentGeneration,
      retire,
      vi.fn(),
      () => false
    );
    const marker = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(key => key?.startsWith('og:form-draft-generation:v1:'))!;

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: marker,
        oldValue: oldGeneration,
        newValue: currentGeneration,
      })
    );

    expect(retire).not.toHaveBeenCalled();
    unregister();
  });

  it('retires local editors even when generation rotation fails', () => {
    const generation = getDraftGeneration(identity)!;
    const retire = vi.fn();
    const unregister = registerDraftEditor(identity, generation, retire, vi.fn(), () => true);
    writeFormDraft(identity, generation, { title: 'Private text' });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage blocked');
    });

    expect(clearAccountDrafts(identity)).toBe(false);
    expect(retire).toHaveBeenCalledOnce();
    expect(hasAccountDrafts(identity)).toBe(false);
    setItem.mockRestore();
    unregister();
  });

  it('continues clearing drafts after one storage removal fails', () => {
    const generation = getDraftGeneration(identity)!;
    const marker = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(key => key?.startsWith('og:form-draft-generation:v1:'))!;
    const namespace = marker.split(':').at(-1);
    const firstDraftKey = `og:form-draft:v1:${namespace}:project-new:new`;
    const secondDraftKey = `og:form-draft:v1:${namespace}:coloring-book-new:new`;
    for (const [key, kind, title] of [
      [firstDraftKey, 'project-new', 'Project'],
      [secondDraftKey, 'coloring-book-new', 'Book'],
    ]) {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, kind, savedAt: Date.now(), generation, values: { title } })
      );
    }
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    removeItem.mockImplementation(key => {
      if (key === firstDraftKey) throw new Error('Storage blocked');
      originalRemoveItem.call(localStorage, key);
    });

    try {
      expect(clearAccountDrafts(identity)).toBe(false);
      expect(localStorage.getItem(firstDraftKey)).not.toBeNull();
      expect(localStorage.getItem(secondDraftKey)).toBeNull();
    } finally {
      removeItem.mockRestore();
    }
  });

  it('drops drafts older than 30 days', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const generation = getDraftGeneration(identity)!;
      writeFormDraft(identity, generation, { title: 'Old' });
      vi.setSystemTime(new Date('2026-02-02T00:00:00Z'));
      expect(readFormDraft(identity, generation, isDraft).draft).toBeNull();
      expect(hasAccountDrafts(identity)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
