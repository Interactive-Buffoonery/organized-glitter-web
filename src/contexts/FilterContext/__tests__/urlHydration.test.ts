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
  setDiamondPaginationParams,
  LEGACY_URL_FILTER_PARAMS,
  URL_FILTER_PARAMS,
} from '../urlHydration';
import { getDefaultFilters } from '../types';

const parse = (query: string) => getInitialFiltersFromUrl(new URLSearchParams(query));

describe('diamond pagination URL', () => {
  it('restores only URL-owned defaults and ignores URL view preferences', () => {
    const { viewType, ...defaults } = getDefaultFilters();
    expect(viewType).toBeDefined();
    expect(getDiamondUrlStateFromUrl(new URLSearchParams('viewType=table'))).toEqual(defaults);
    expect(getDiamondUrlStateFromUrl(new URLSearchParams('page=3'))).not.toHaveProperty('viewType');
  });

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

  it('prefers canonical tags but keeps legacy tag text unchanged as a fallback', () => {
    expect(parse('tags=tag-a&tag=legacy')).toEqual({ selectedTags: ['tag-a'] });
    expect(parse('tags=,&tag=%20Fantasy,Art%20')).toEqual({
      selectedTags: [' Fantasy,Art '],
    });
  });

  it('marks the default page-one result as an explicit URL snapshot', () => {
    const filters = getDefaultFilters();
    const params = setDiamondDashboardParams(new URLSearchParams('craft=diamond'), filters);
    expect(URL_FILTER_PARAMS.some(param => params.has(param))).toBe(true);
    expect(params.get('page')).toBe('1');
    expect(getDiamondUrlStateFromUrl(params)).toMatchObject({
      currentPage: 1,
      pageSize: 25,
      searchTerm: '',
      selectedCompany: 'all',
      sortField: 'last_updated',
      sortDirection: 'desc',
    });
  });

  it('carries every result-defining panel filter and sort into a shareable URL', () => {
    const filters = {
      ...getDefaultFilters(),
      selectedDrillShape: 'round',
      selectedYearFinished: '2024',
      includeMiniKits: false,
      includeDestashed: true,
      includeArchived: true,
      searchAllFields: true,
      sortField: 'kit_name' as const,
      sortDirection: 'asc' as const,
      currentPage: 3,
    };
    const params = setDiamondDashboardParams(new URLSearchParams('craft=diamond'), filters);
    expect(getInitialFiltersFromUrl(params)).toMatchObject({
      selectedDrillShape: 'round',
      selectedYearFinished: '2024',
      includeMiniKits: false,
      includeDestashed: true,
      includeArchived: true,
      searchAllFields: true,
      sortField: 'kit_name',
      sortDirection: 'asc',
      currentPage: 3,
      pageSize: 25,
    });
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

  it('keeps page size on later pages and omits default pagination on page one', () => {
    expect(setDiamondPaginationParams(new URLSearchParams('status=stash'), 3, 50).toString()).toBe(
      'status=stash&page=3&pageSize=50'
    );
    expect(
      setDiamondPaginationParams(new URLSearchParams('page=3&pageSize=50'), 1, 25).toString()
    ).toBe('');
  });
});

describe('getInitialFiltersFromUrl', () => {
  it('returns an empty object when no relevant params are present', () => {
    expect(parse('')).toEqual({});
    expect(parse('unrelated=value')).toEqual({});
  });

  describe('?company=', () => {
    it('applies a non-empty company ID to selectedCompany', () => {
      expect(parse('company=abc123')).toEqual({ selectedCompany: 'abc123' });
    });

    it('applies an empty string value (matches existing company hydration behavior)', () => {
      expect(parse('company=')).toEqual({ selectedCompany: '' });
    });
  });

  describe('?status=', () => {
    it.each([
      ['wishlist'],
      ['purchased'],
      ['stash'],
      ['progress'],
      ['onhold'],
      ['completed'],
      ['archived'],
      ['destashed'],
      ['everything'],
    ])('applies a valid status value %s to activeStatus', status => {
      expect(parse(`status=${status}`)).toEqual({ activeStatus: status });
    });

    it('ignores unknown status values so the default wins', () => {
      expect(parse('status=garbage')).toEqual({});
      expect(parse('status=DROP TABLE users')).toEqual({});
    });

    it('ignores an empty status value', () => {
      expect(parse('status=')).toEqual({});
    });
  });

  describe('?artist=', () => {
    it('applies an artist ID to selectedArtist', () => {
      expect(parse('artist=artist_123')).toEqual({ selectedArtist: 'artist_123' });
    });

    it('applies an empty string value', () => {
      expect(parse('artist=')).toEqual({ selectedArtist: '' });
    });
  });

  describe('?tags=', () => {
    it('hydrates multiple repeated tag params into selectedTags', () => {
      expect(parse('tags=tag-a&tags=tag-b')).toEqual({ selectedTags: ['tag-a', 'tag-b'] });
    });

    it('hydrates comma-delimited tag params into selectedTags', () => {
      expect(parse('tags=tag-a,tag-b')).toEqual({ selectedTags: ['tag-a', 'tag-b'] });
    });

    it('deduplicates duplicate tag ids while preserving order', () => {
      expect(parse('tags=tag-a&tags=tag-b&tags=tag-a')).toEqual({
        selectedTags: ['tag-a', 'tag-b'],
      });
    });

    it('preserves unknown tag ids from the URL', () => {
      expect(parse('tags=missing-tag&tags=tag-b')).toEqual({
        selectedTags: ['missing-tag', 'tag-b'],
      });
    });

    it('ignores empty tag arrays', () => {
      expect(parse('tags=')).toEqual({});
      expect(parse('tags=,&tags=')).toEqual({});
    });
  });

  describe('legacy ?tag=', () => {
    it('hydrates a single legacy tag param for backwards compatibility', () => {
      expect(parse('tag=Fantasy')).toEqual({ selectedTags: ['Fantasy'] });
    });

    it('ignores an empty legacy tag value', () => {
      expect(parse('tag=')).toEqual({});
    });
  });

  describe('?search=', () => {
    it('applies a search term to searchTerm', () => {
      expect(parse('search=Winter%20Moon')).toEqual({ searchTerm: 'Winter Moon' });
      expect(parse('search=%20%20Winter%20Moon%20%20')).toEqual({ searchTerm: 'Winter Moon' });
    });

    it('applies an empty string value', () => {
      expect(parse('search=')).toEqual({ searchTerm: '' });
    });

    it('clears an unusable shared search instead of hydrating it', () => {
      expect(parse('search=a')).toEqual({ searchTerm: '' });
      expect(parse('search=%20a%20')).toEqual({ searchTerm: '' });
    });
  });

  describe('multi-param hydration', () => {
    it('applies company, status, artist, tags, and search together', () => {
      expect(
        parse('company=abc123&status=wishlist&artist=artist_1&tags=tag-a&tags=tag-b&search=Winter')
      ).toEqual({
        selectedCompany: 'abc123',
        activeStatus: 'wishlist',
        selectedArtist: 'artist_1',
        selectedTags: ['tag-a', 'tag-b'],
        searchTerm: 'Winter',
      });
    });

    it('skips only the invalid status field when others are valid', () => {
      expect(parse('company=abc123&status=garbage&tags=tag-a')).toEqual({
        selectedCompany: 'abc123',
        selectedTags: ['tag-a'],
      });
    });
  });

  describe('URL_FILTER_PARAMS drift detection', () => {
    const PARSER_SMOKE_VALUES: Record<(typeof URL_FILTER_PARAMS)[number], string> = {
      company: 'abc123',
      status: 'wishlist',
      artist: 'artist_1',
      tags: 'tag-a',
      search: 'Winter',
      drillShape: 'round',
      yearFinished: '2024',
      includeMiniKits: 'false',
      includeDestashed: 'true',
      includeArchived: 'true',
      searchAllFields: 'true',
      sort: 'kit_name',
      dir: 'asc',
      page: '3',
      pageSize: '50',
    };

    const LEGACY_SMOKE_VALUES: Record<(typeof LEGACY_URL_FILTER_PARAMS)[number], string> = {
      tag: 'legacy-tag',
    };

    it('every entry in URL_FILTER_PARAMS is handled by a parser branch', () => {
      for (const param of URL_FILTER_PARAMS) {
        const smoke = PARSER_SMOKE_VALUES[param];
        const result = parse(`${param}=${encodeURIComponent(smoke)}`);
        expect(
          Object.keys(result).length,
          `URL_FILTER_PARAMS contains "${param}" but getInitialFiltersFromUrl produced no override for ?${param}=${smoke}. Either add a parser branch for "${param}" or remove it from URL_FILTER_PARAMS.`
        ).toBeGreaterThan(0);
      }
    });

    it('every entry in LEGACY_URL_FILTER_PARAMS is still parsed for backwards compatibility', () => {
      for (const param of LEGACY_URL_FILTER_PARAMS) {
        const smoke = LEGACY_SMOKE_VALUES[param];
        const result = parse(`${param}=${encodeURIComponent(smoke)}`);
        expect(
          Object.keys(result).length,
          `LEGACY_URL_FILTER_PARAMS contains "${param}" but getInitialFiltersFromUrl produced no override for ?${param}=${smoke}. Either keep the compatibility parser branch or remove "${param}" from LEGACY_URL_FILTER_PARAMS.`
        ).toBeGreaterThan(0);
      }
    });

    it('the canonical parser branches line up with URL_FILTER_PARAMS', () => {
      const allParams = URL_FILTER_PARAMS.map(
        p => `${p}=${encodeURIComponent(PARSER_SMOKE_VALUES[p])}`
      ).join('&');
      const result = parse(allParams);

      expect(Object.keys(result).length).toBe(URL_FILTER_PARAMS.length);
    });
  });
});
