import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { APP_ROUTE_PATHS, isKnownAppRoute, isStaticFileRequest } from './app-route-policy.js';

describe('server app route policy', () => {
  it('matches every frontend route except the catch-all', async () => {
    const source = await fs.readFile('src/components/routing/routeDefinitions.tsx', 'utf8');
    const frontendPaths = [...source.matchAll(/\bpath: '([^']+)'/g)]
      .map(match => match[1])
      .filter(route => route !== '*');

    expect([...APP_ROUTE_PATHS].sort()).toEqual(frontendPaths.sort());
  });

  it.each([
    '/',
    '/about/',
    '/projects/record123',
    '/coloring/book123/pages/page456',
    '/auth/confirm-password-reset/token.with.dots',
    '/auth/verify-email/token.with.dots',
    '/auth/confirm-email-change/token.with.dots',
  ])('accepts known route %s', pathname => {
    expect(isKnownAppRoute(pathname)).toBe(true);
  });

  it.each(['/no-such-page-xyz', '/projects', '/auth/verify-email', '/projects/id/extra'])(
    'rejects unknown route %s',
    pathname => {
      expect(isKnownAppRoute(pathname)).toBe(false);
    }
  );
});

describe('shared static-file request policy', () => {
  it.each([
    '/assets/chunk-abc.js',
    '/missing.css',
    '/logo.svg',
    '/.well-known/apple-app-site-association',
  ])('classifies %s as a static-file request', pathname => {
    expect(isStaticFileRequest(pathname)).toBe(true);
  });

  it.each(['/no-such-page-xyz', '/projects/record123', '/auth/verify-email/token.with.dots'])(
    'leaves %s to the app route policy',
    pathname => {
      expect(isStaticFileRequest(pathname)).toBe(false);
    }
  );
});
