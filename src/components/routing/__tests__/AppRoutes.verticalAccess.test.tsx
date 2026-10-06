import { describe, expect, it } from 'vitest';

import { APP_ROUTES, type RouteVerticalAccess } from '../routeDefinitions';

const routePathsWhere = (predicate: (route: (typeof APP_ROUTES)[number]) => boolean) => {
  const paths: string[] = [];

  for (const route of APP_ROUTES) {
    if (predicate(route)) {
      paths.push(route.path);
    }
  }

  return paths;
};

const routePathsFor = (verticalAccess: RouteVerticalAccess) =>
  routePathsWhere(route => route.verticalAccess === verticalAccess);

describe('AppRoutes vertical-access contract', () => {
  it('uses Library in the dashboard error UI while retaining its route identifier', () => {
    const dashboard = APP_ROUTES.find(route => route.path === '/dashboard');

    expect(dashboard?.errorBoundary).toBe('Dashboard');
    expect(dashboard?.errorBoundaryLabel).toBe('Library');
  });

  it('requires every route to declare its vertical access', () => {
    expect(APP_ROUTES.length).toBeGreaterThan(0);

    APP_ROUTES.forEach(route => {
      expect(route.verticalAccess, `${route.path} must declare verticalAccess`).toBeDefined();
    });
  });

  it('keeps protected app routes out of the public vertical bucket', () => {
    const publicProtectedRoutes = routePathsWhere(
      route => route.protected === true && route.verticalAccess === 'public'
    );

    expect(publicProtectedRoutes).toEqual([]);
  });

  it('captures the current shared protected route set', () => {
    const sharedProtectedRoutes = routePathsWhere(
      route => route.protected === true && route.verticalAccess === 'shared'
    );

    expect(sharedProtectedRoutes).toEqual([
      '/overview',
      '/dashboard',
      '/projects/new',
      '/coloring/new',
      '/profile',
      '/change-password',
      '/change-email',
      '/delete-account',
      '/options',
      '/import',
      '/randomizer',
      '/stats',
      '/notes',
    ]);
  });

  it('captures the current diamond-painting-only route set', () => {
    expect(routePathsFor('diamond_painting')).toEqual([
      '/projects/:id',
      '/projects/:id/edit',
      '/options/companies',
      '/options/artists',
      '/options/tags',
      '/companies',
      '/artists',
      '/tags',
    ]);
  });

  it('keeps the import route shared for multi-craft archive and photo workflows', () => {
    const route = APP_ROUTES.find(item => item.path === '/import');

    expect(route?.verticalAccess).toBe('shared');
    expect(route?.metadata.title).toBe('Data settings | Organized Glitter');
  });

  it('captures the current coloring-only route set', () => {
    expect(routePathsFor('coloring_books')).toEqual([
      '/coloring',
      '/coloring/:id',
      '/coloring/:id/edit',
      '/coloring/:bookId/pages/:pageId',
      '/options/publishers',
      '/options/illustrators',
      '/options/coloring-mediums',
    ]);
  });
});
