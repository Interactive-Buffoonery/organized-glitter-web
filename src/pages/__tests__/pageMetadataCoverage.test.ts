import { describe, expect, it } from 'vitest';

import { APP_ROUTES } from '@/components/routing/routeDefinitions';

const GENERIC_SHELL_TITLE = 'Organized Glitter - Coloring Book and Diamond Art Tracker';
const DYNAMIC_TITLE_ROUTE_PATHS = new Set([
  '/projects/new',
  '/coloring/:id',
  '/coloring/:id/edit',
  '/coloring/:bookId/pages/:pageId',
  '/projects/:id',
  '/projects/:id/edit',
]);
const PAGE_OWNED_METADATA_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm-password-reset',
  '/auth/confirm-password-reset/:token',
  '/auth/verify-email/:token',
  '/email-confirmation',
  ...DYNAMIC_TITLE_ROUTE_PATHS,
  '/change-password',
  '/change-email',
  '/auth/confirm-email-change/:token',
  '/delete-account',
  '/about',
  '/privacy',
  '/terms',
  '/links',
]);

describe('page metadata coverage', () => {
  it('requires every user-visible route to declare a specific page title', () => {
    expect(APP_ROUTES.length).toBeGreaterThan(0);

    APP_ROUTES.forEach(route => {
      expect(route.metadata?.title, `${route.path} must declare route metadata`).toBeTruthy();
      expect(route.metadata?.title, `${route.path} must include the app name`).toContain(
        'Organized Glitter'
      );
      expect(route.metadata?.title, `${route.path} must not use the generic shell title`).not.toBe(
        GENERIC_SHELL_TITLE
      );
    });
  });

  it('keeps route fallbacks for pages that can replace the title with record-specific metadata', () => {
    const dynamicRoutes = APP_ROUTES.filter(route => DYNAMIC_TITLE_ROUTE_PATHS.has(route.path));

    expect(dynamicRoutes.map(route => route.path)).toEqual([...DYNAMIC_TITLE_ROUTE_PATHS]);
    dynamicRoutes.forEach(route => {
      expect(route.metadata?.title, `${route.path} needs an accessible loading fallback`).toMatch(
        /\| Organized Glitter$/
      );
    });
  });

  it('marks page-owned metadata routes so route fallbacks cannot overwrite them', () => {
    const pageOwnedRoutes = APP_ROUTES.filter(route => route.pageOwnsMetadata);

    expect(pageOwnedRoutes.map(route => route.path)).toEqual([...PAGE_OWNED_METADATA_PATHS]);
  });
});
