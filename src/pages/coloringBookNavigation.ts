const COLORING_DASHBOARD_PATH = '/dashboard?craft=coloring';

export const getColoringDashboardReturnPath = (returnTo: unknown): string => {
  if (typeof returnTo !== 'string') return COLORING_DASHBOARD_PATH;
  try {
    const parsed = new URL(returnTo, 'https://navigation.invalid');
    if (parsed.origin !== 'https://navigation.invalid') return COLORING_DASHBOARD_PATH;
    if (parsed.pathname !== '/dashboard' || parsed.searchParams.get('craft') !== 'coloring') {
      return COLORING_DASHBOARD_PATH;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return COLORING_DASHBOARD_PATH;
  }
};

export const getColoringBookDetailPath = (bookId: string, returnTo: string): string => {
  const params = new URLSearchParams({ returnTo: getColoringDashboardReturnPath(returnTo) });
  return `/coloring/${encodeURIComponent(bookId)}?${params.toString()}`;
};

export const getColoringPageDetailPath = (
  bookId: string,
  pageId: string,
  returnTo: string
): string => {
  const params = new URLSearchParams({ returnTo: getColoringDashboardReturnPath(returnTo) });
  return `/coloring/${encodeURIComponent(bookId)}/pages/${encodeURIComponent(pageId)}?${params.toString()}`;
};
