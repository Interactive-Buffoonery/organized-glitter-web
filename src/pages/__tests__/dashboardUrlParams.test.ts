import { describe, expect, it } from 'vitest';

import { URL_COLORING_FILTER_PARAMS } from '@/contexts/ColoringFilterContext/urlHydration';
import { LEGACY_URL_FILTER_PARAMS, URL_FILTER_PARAMS } from '@/contexts/FilterContext/urlHydration';
import {
  DASHBOARD_FILTER_PARAM_NAMES,
  getDashboardMode,
  getDashboardModeSearchParams,
} from '../dashboardUrlParams';

const STALE_COLORING_PAGE_FILTER_PARAMS = [
  'pageStatus',
  'books',
  'pagePublishers',
  'pageIllustrators',
  'pageTags',
  'pageMystery',
  'reveal',
  'q',
  'sort',
  'dir',
];

describe('getDashboardModeSearchParams', () => {
  it('clears legacy coloring ownership when switching away from coloring books', () => {
    const next = getDashboardModeSearchParams(
      new URLSearchParams('craft=coloring&ownership=wishlist&status=wishlist&keep=1'),
      'diamond'
    );

    expect(next.has('ownership')).toBe(false);
    expect(next.has('status')).toBe(false);
    expect(next.has('craft')).toBe(false);
    expect(next.get('keep')).toBe('1');
  });

  it('clears stale filter params when switching between craft modes', () => {
    const next = getDashboardModeSearchParams(
      new URLSearchParams(
        [
          'craft=coloring',
          'status=wishlist',
          'publishers=pub-1',
          'pageStatus=completed',
          'books=book-1',
          'pageMystery=mystery',
          'company=company-1',
          'tag=tag-1',
          'q=owl',
          'sort=page_number',
          'dir=asc',
          'photos=true',
        ].join('&')
      ),
      'coloring-books'
    );

    expect(next.get('craft')).toBe('coloring');
    expect(next.get('company')).toBeNull();
    expect(next.get('tag')).toBeNull();
    expect(next.get('status')).toBeNull();
    expect(next.get('publishers')).toBeNull();
    expect(next.get('pageStatus')).toBeNull();
    expect(next.get('books')).toBeNull();
    expect(next.get('pageMystery')).toBeNull();
    expect(next.get('q')).toBeNull();
    expect(next.get('sort')).toBeNull();
    expect(next.get('dir')).toBeNull();
    expect(next.get('photos')).toBeNull();
  });

  it('preserves unrelated query params while changing modes', () => {
    const next = getDashboardModeSearchParams(
      new URLSearchParams('craft=coloring&ownership=wishlist&returnTo=overview'),
      'coloring-books'
    );

    expect(next.get('craft')).toBe('coloring');
    expect(next.get('returnTo')).toBe('overview');
  });

  it('treats stale coloring pages dashboard URLs as the default dashboard mode', () => {
    expect(getDashboardMode(new URLSearchParams('craft=coloring-pages'))).toBe('diamond');
  });

  it('keeps the cleanup list aligned with exported dashboard filter param lists', () => {
    expect(DASHBOARD_FILTER_PARAM_NAMES).toEqual(
      expect.arrayContaining([
        ...URL_FILTER_PARAMS,
        ...LEGACY_URL_FILTER_PARAMS,
        ...URL_COLORING_FILTER_PARAMS,
        ...STALE_COLORING_PAGE_FILTER_PARAMS,
        'ownership',
        'photos',
      ])
    );
  });
});
