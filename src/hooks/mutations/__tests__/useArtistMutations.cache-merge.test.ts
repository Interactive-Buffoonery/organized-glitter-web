import { describe, it, expect } from 'vitest';
import { insertCreatedArtistIntoArtistQueriesCache } from '../useArtistMutations';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';

describe('insertCreatedArtistIntoArtistQueriesCache', () => {
  it('does not duplicate a created artist that is already cached', () => {
    const list: ArtistListItem[] = [{ id: 'a', name: 'Alpha' }];
    const next = insertCreatedArtistIntoArtistQueriesCache(list, {
      id: 'a',
      name: 'Alpha',
    });

    expect(next).toBe(list);
  });
});
