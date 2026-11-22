import { describe, expect, it } from 'vitest';
import { findTagByName, planImportTags, tagNameKey } from '../tagNames';

describe('planImportTags', () => {
  it('reuses existing tags regardless of case and whitespace', () => {
    const plan = planImportTags([{ id: 'tag-cats', name: 'cats' }], ['CATS', ' Cats ']);

    expect(plan.namesToCreate).toEqual([]);
    expect(plan.tagIds.get(tagNameKey('CATS'))).toBe('tag-cats');
    expect(plan.tagIds.get(tagNameKey(' Cats '))).toBe('tag-cats');
  });

  it('creates one tag for CSV names that differ only by case', () => {
    const plan = planImportTags([], ['Dogs', 'dogs', 'DOGS', '  ']);

    expect(plan.namesToCreate).toEqual(['Dogs']);
  });
});

describe('findTagByName', () => {
  it('matches ignoring case and surrounding whitespace', () => {
    const cats = { id: 'tag-cats', name: 'cats' };

    expect(findTagByName([cats], '  CATS ')).toBe(cats);
    expect(findTagByName([cats], 'cat')).toBeUndefined();
  });
});
