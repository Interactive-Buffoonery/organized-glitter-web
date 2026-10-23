/**
 * Unit tests for URL param → FilterState hydration.
 * @author @serabi
 * @created 2026-04-12
 */

import { describe, it, expect } from 'vitest';
import {
  getDiamondPaginationFromUrl,
  getDiamondUrlStateFromUrl,
  getInitialFiltersFromUrl,
  setDiamondDashboardParams,
} from '../urlHydration';
import { getDefaultFilters } from '../types';

const parse = (query: string) => getInitialFiltersFromUrl(new URLSearchParams(query));

describe('diamond pagination URL', () => {
  it('round-trips IDs, tags, and search while retaining unrelated repeated params', () => {
    const filters = {
      ...getDefaultFilters(),
      activeStatus: 'wishlist' as const,
      selectedCompany: 'company-a',
      selectedArtist: 'artist-a',
      selectedTags: ['tag-a', 'tag-b'],
      searchTerm: ' Winter Moon ',
      pageSize: 50,
    };
    const params = setDiamondDashboardParams(
      new URLSearchParams('tag=legacy&tags=old&craft=diamond&extra=one&extra=two'),
      filters
    );
    const { viewType, ...expected } = filters;
    expect(viewType).toBeDefined();
    expect(getDiamondUrlStateFromUrl(params)).toEqual({ ...expected, searchTerm: 'Winter Moon' });
    expect(params.getAll('tags')).toEqual(['tag-a', 'tag-b']);
    expect(params.has('tag')).toBe(false);
    expect(params.getAll('extra')).toEqual(['one', 'two']);
    expect(params.get('craft')).toBe('diamond');
  });

  it('rejects malformed result filters and removes default values', () => {
    expect(
      parse(
        'drillShape=star&yearFinished=next&includeMiniKits=maybe&includeArchived=1&includeDestashed=1&searchAllFields=1&sort=bogus&dir=up'
      )
    ).toEqual({});
    expect(
      setDiamondDashboardParams(
        new URLSearchParams('sort=bogus&includeArchived=true'),
        getDefaultFilters()
      ).toString()
    ).toBe('page=1');
  });
  it('hydrates a shared page and size while rejecting malformed values', () => {
    expect(getDiamondPaginationFromUrl(new URLSearchParams('page=3&pageSize=50'))).toEqual({
      currentPage: 3,
      pageSize: 50,
    });
    expect(getDiamondPaginationFromUrl(new URLSearchParams('page=-2&pageSize=37'))).toEqual({
      currentPage: 1,
      pageSize: 25,
    });
  });
});
