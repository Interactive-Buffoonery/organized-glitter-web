import { describe, it, expect } from 'vitest';
import {
  insertCreatedArtistIntoArtistQueriesCache,
  mergeUpdatedArtistIntoArtistQueriesCache,
} from '../useArtistMutations';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';

describe('mergeUpdatedArtistIntoArtistQueriesCache', () => {
  it('updates a row in a flat list and re-sorts by name', () => {
    const list: ArtistListItem[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
    ];
    const next = mergeUpdatedArtistIntoArtistQueriesCache(list, 'b', {
      name: 'Apple',
    }) as ArtistListItem[];
    expect(next).not.toBe(list);
    expect(next.map(c => c.id)).toEqual(['a', 'b']);
    expect(next.find(c => c.id === 'b')?.name).toBe('Apple');
  });

  it('returns the same reference when id is not in the list', () => {
    const list: ArtistListItem[] = [{ id: 'a', name: 'Alpha' }];
    const next = mergeUpdatedArtistIntoArtistQueriesCache(list, 'missing', { name: 'X' });
    expect(next).toBe(list);
  });

  it('passes through unrelated cache shapes', () => {
    expect(mergeUpdatedArtistIntoArtistQueriesCache(undefined, 'x', { name: 'n' })).toBe(undefined);
    expect(mergeUpdatedArtistIntoArtistQueriesCache({ foo: 1 }, 'x', { name: 'n' })).toEqual({
      foo: 1,
    });
  });
});

describe('insertCreatedArtistIntoArtistQueriesCache', () => {
  it('adds a created artist to a flat list and re-sorts by name', () => {
    const list: ArtistListItem[] = [
      { id: 'b', name: 'Bravo' },
      { id: 'd', name: 'Delta' },
    ];
    const next = insertCreatedArtistIntoArtistQueriesCache(list, {
      id: 'a',
      name: 'Alpha',
    }) as ArtistListItem[];

    expect(next).not.toBe(list);
    expect(next.map(artist => artist.name)).toEqual(['Alpha', 'Bravo', 'Delta']);
  });

  it('does not duplicate a created artist that is already cached', () => {
    const list: ArtistListItem[] = [{ id: 'a', name: 'Alpha' }];
    const next = insertCreatedArtistIntoArtistQueriesCache(list, {
      id: 'a',
      name: 'Alpha',
    });

    expect(next).toBe(list);
  });

  it('passes through unrelated cache shapes', () => {
    expect(insertCreatedArtistIntoArtistQueriesCache(undefined, { id: 'x', name: 'X' })).toBe(
      undefined
    );
    expect(insertCreatedArtistIntoArtistQueriesCache({ foo: 1 }, { id: 'x', name: 'X' })).toEqual({
      foo: 1,
    });
  });
});
