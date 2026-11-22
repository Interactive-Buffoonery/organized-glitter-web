import { describe, expect, it, vi } from 'vitest';
import { createErrorResponse, createSuccessResponse } from '@/types/shared';
import {
  createTagOrReuseMatch,
  findTagByName,
  planImportTags,
  resolveTagIds,
  tagNameKey,
} from '../tagNames';

const cats = { id: 'tag-cats', name: 'cats' };
const capitalCats = { id: 'tag-capital-cats', name: 'Cats' };

describe('tagNameKey', () => {
  it('ignores any surrounding whitespace, case, and Unicode composition', () => {
    expect(tagNameKey('\tcats\n')).toBe('cats');
    expect(tagNameKey('Étoiles')).toBe(tagNameKey('étoiles'));
    expect(tagNameKey('Étoiles')).toBe(tagNameKey('étoiles'));
  });
});

describe('planImportTags', () => {
  it('reuses existing tags regardless of case and whitespace', () => {
    const plan = planImportTags([cats], ['CATS', ' Cats ', '\tcats']);

    expect(plan.namesToCreate).toEqual([]);
    expect(plan.resolveTagId('CATS')).toBe('tag-cats');
    expect(plan.resolveTagId('\tcats')).toBe('tag-cats');
  });

  it('creates one tag for CSV names that differ only by case', () => {
    const plan = planImportTags([], ['Dogs', 'dogs', 'DOGS', '  ']);

    expect(plan.namesToCreate).toEqual(['Dogs']);
    plan.addTag({ id: 'tag-dogs', name: 'Dogs' });
    expect(plan.resolveTagId('DOGS')).toBe('tag-dogs');
  });

  it('prefers the exact spelling when legacy case duplicates exist', () => {
    const plan = planImportTags([capitalCats, cats], ['cats', 'Cats']);

    expect(plan.resolveTagId('cats')).toBe('tag-cats');
    expect(plan.resolveTagId('Cats')).toBe('tag-capital-cats');
  });
});

describe('findTagByName', () => {
  it('matches ignoring case and surrounding whitespace', () => {
    expect(findTagByName([cats], '  CATS ')).toBe(cats);
    expect(findTagByName([cats], 'cat')).toBeUndefined();
  });

  it('prefers an exact match, then the same case-insensitive match in any order', () => {
    expect(findTagByName([capitalCats, cats], 'cats')).toBe(cats);
    expect(findTagByName([cats, capitalCats], 'Cats')).toBe(capitalCats);
    expect(findTagByName([cats, capitalCats], 'CATS')).toBe(
      findTagByName([capitalCats, cats], 'CATS')
    );
  });
});

describe('createTagOrReuseMatch', () => {
  it('reuses a tag created at the same moment when the create is rejected', async () => {
    const rejection = createErrorResponse(new Error('A tag named "cats" already exists.'));

    const result = await createTagOrReuseMatch(
      'CATS',
      async () => rejection,
      async () => createSuccessResponse([cats])
    );

    expect(result).toEqual(createSuccessResponse(cats));
  });

  it('returns the original error when no matching tag exists', async () => {
    const rejection = createErrorResponse(new Error('Network down'));

    const result = await createTagOrReuseMatch(
      'CATS',
      async () => rejection,
      async () => createSuccessResponse([])
    );

    expect(result).toBe(rejection);
  });
});

describe('resolveTagIds', () => {
  it('reuses an existing tag with surrounding whitespace instead of creating one', async () => {
    const create = vi.fn();

    const ids = await resolveTagIds(
      ['cats', 'CATS'],
      async () => createSuccessResponse([{ id: 'tag-padded', name: ' cats ' }]),
      create
    );

    expect(ids).toEqual(['tag-padded', 'tag-padded']);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates missing tags once and reuses them for later names', async () => {
    const create = vi.fn(async ({ name }: { name: string }) =>
      createSuccessResponse({ id: `tag-${name}`, name })
    );

    const ids = await resolveTagIds(
      ['Dogs', 'dogs'],
      async () => createSuccessResponse([]),
      create
    );

    expect(ids).toEqual(['tag-Dogs', 'tag-Dogs']);
    expect(create).toHaveBeenCalledOnce();
  });
});
