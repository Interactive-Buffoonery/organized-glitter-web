import type { DashboardMode } from '@/components/dashboard/DashboardShell';
import { URL_COLORING_FILTER_PARAMS } from '@/contexts/ColoringFilterContext/urlHydration';
import { LEGACY_URL_FILTER_PARAMS, URL_FILTER_PARAMS } from '@/contexts/FilterContext/urlHydration';

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
] as const;

export const DASHBOARD_FILTER_PARAM_NAMES: ReadonlyArray<string> = Array.from(
  new Set([
    ...URL_FILTER_PARAMS,
    ...LEGACY_URL_FILTER_PARAMS,
    ...URL_COLORING_FILTER_PARAMS,
    ...STALE_COLORING_PAGE_FILTER_PARAMS,
    'ownership',
    'photos',
  ])
);

const deleteDashboardFilterParams = (searchParams: URLSearchParams) => {
  DASHBOARD_FILTER_PARAM_NAMES.forEach(param => searchParams.delete(param));
};

export const getDashboardMode = (searchParams: URLSearchParams): DashboardMode => {
  const craft = searchParams.get('craft');
  if (craft === 'coloring') return 'coloring-books';
  return 'diamond';
};

export const getDashboardModeSearchParams = (
  current: URLSearchParams,
  mode: DashboardMode
): URLSearchParams => {
  const next = new URLSearchParams(current);

  deleteDashboardFilterParams(next);

  if (mode === 'coloring-books') {
    next.set('craft', 'coloring');
    return next;
  }

  next.delete('craft');
  return next;
};
