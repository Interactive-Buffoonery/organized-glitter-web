export const PUBLIC_PAGE_PATHS = ['/about', '/links', '/privacy', '/terms', '/contact'];

// Keep this list in sync with APP_ROUTES. app-route-policy.test.js enforces parity.
export const APP_ROUTE_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm-password-reset',
  '/auth/confirm-password-reset/:token',
  '/auth/verify-email/:token',
  '/email-confirmation',
  '/overview',
  '/dashboard',
  '/projects/new',
  '/coloring',
  '/coloring/new',
  '/coloring/:id',
  '/coloring/:id/edit',
  '/coloring/:bookId/pages/:pageId',
  '/projects/:id',
  '/projects/:id/edit',
  '/profile',
  '/change-password',
  '/change-email',
  '/auth/confirm-email-change/:token',
  '/delete-account',
  '/options',
  '/options/companies',
  '/options/artists',
  '/options/tags',
  '/options/publishers',
  '/options/illustrators',
  '/options/coloring-mediums',
  '/companies',
  '/artists',
  '/tags',
  '/import',
  '/support',
  '/support/success',
  '/randomizer',
  '/stats',
  '/notes',
  ...PUBLIC_PAGE_PATHS.filter(route => route !== '/contact'),
];

const routePatterns = APP_ROUTE_PATHS.map(route =>
  route
    .split('/')
    .filter(Boolean)
    .map(segment => (segment.startsWith(':') ? null : segment.toLowerCase()))
);

export function isKnownAppRoute(pathname) {
  let segments;
  try {
    segments = pathname
      .split('/')
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment).toLowerCase());
  } catch {
    return false;
  }

  return routePatterns.some(
    pattern =>
      pattern.length === segments.length &&
      pattern.every((segment, index) =>
        segment === null ? Boolean(segments[index]) : segment === segments[index]
      )
  );
}

const staticDirectoryPrefixes = ['/assets/', '/css/', '/images/', '/js/'];
const staticFileExtensions =
  /\.(?:css|html|ico|js|jpeg|jpg|json|png|svg|txt|webmanifest|woff2?|xml)$/i;

export function isStaticFileRequest(pathname) {
  if (pathname === '/.well-known/apple-app-site-association') return true;
  if (staticDirectoryPrefixes.some(prefix => pathname.startsWith(prefix))) return true;
  const rootFileName = pathname.replace(/^\/+/, '');
  return !rootFileName.includes('/') && staticFileExtensions.test(rootFileName);
}
