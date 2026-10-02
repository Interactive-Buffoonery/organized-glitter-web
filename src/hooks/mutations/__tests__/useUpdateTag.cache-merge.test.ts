import { describe, it, expect } from 'vitest';
import { mergeUpdatedTagIntoTagQueriesCache } from '../useUpdateTag';
import type { Tag } from '@/types/tag';

const makeTag = (overrides: Partial<Tag>): Tag => ({
  id: 'tag-1',
  userId: 'user-1',
  name: 'Alpha',
  slug: 'alpha',
  color: '#000000',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('mergeUpdatedTagIntoTagQueriesCache', () => {
  it('updates a row in a flat tag list and re-sorts by name', () => {
    const list: Tag[] = [
      makeTag({ id: 'a', name: 'Alpha', slug: 'alpha' }),
      makeTag({ id: 'b', name: 'Bravo', slug: 'bravo' }),
    ];
    const next = mergeUpdatedTagIntoTagQueriesCache(list, 'b', {
      name: 'Apple',
      slug: 'apple',
      color: '#FF0000',
    }) as Tag[];
    expect(next).not.toBe(list);
    expect(next.map(t => t.id)).toEqual(['a', 'b']);
    const updated = next.find(t => t.id === 'b')!;
    expect(updated.name).toBe('Apple');
    expect(updated.slug).toBe('apple');
    expect(updated.color).toBe('#FF0000');
    // Unchanged fields preserved
    expect(updated.userId).toBe('user-1');
  });

  it('returns the same reference when id is not in the list', () => {
    const list: Tag[] = [makeTag({ id: 'a' })];
    const next = mergeUpdatedTagIntoTagQueriesCache(list, 'missing', {
      name: 'X',
      slug: 'x',
      color: '#000000',
    });
    expect(next).toBe(list);
  });

  it('passes through unrelated cache shapes', () => {
    expect(
      mergeUpdatedTagIntoTagQueriesCache(undefined, 'x', {
        name: 'n',
        slug: 'n',
        color: '#000',
      })
    ).toBe(undefined);
    expect(
      mergeUpdatedTagIntoTagQueriesCache({ foo: 1 }, 'x', {
        name: 'n',
        slug: 'n',
        color: '#000',
      })
    ).toEqual({ foo: 1 });
  });
});
