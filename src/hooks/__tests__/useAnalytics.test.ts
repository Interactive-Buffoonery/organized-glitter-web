import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsPath } from '../useAnalytics';

describe('sanitizeAnalyticsPath', () => {
  it('redacts auth tokens from analytics paths', () => {
    expect(sanitizeAnalyticsPath('/auth/confirm-password-reset/reset-token-123')).toBe(
      '/auth/confirm-password-reset/[redacted]'
    );
    expect(sanitizeAnalyticsPath('/auth/verify-email/verify-token-123')).toBe(
      '/auth/verify-email/[redacted]'
    );
    expect(sanitizeAnalyticsPath('/auth/confirm-email-change/email-token-123')).toBe(
      '/auth/confirm-email-change/[redacted]'
    );
  });

  it('strips query strings and hashes from analytics paths', () => {
    expect(sanitizeAnalyticsPath('/dashboard?token=secret#section')).toBe('/dashboard');
    expect(sanitizeAnalyticsPath('/projects/abc123?tab=notes')).toBe('/projects/:id');
  });

  it('redacts auth tokens before returning a clean path', () => {
    expect(sanitizeAnalyticsPath('/auth/verify-email/verify-token-123?next=/dashboard')).toBe(
      '/auth/verify-email/[redacted]'
    );
  });

  it('keeps ordinary app paths intact', () => {
    expect(sanitizeAnalyticsPath('/dashboard')).toBe('/dashboard');
    expect(sanitizeAnalyticsPath('/projects/new')).toBe('/projects/new');
  });

  it.each([
    ['/projects/private-project', '/projects/:id'],
    ['/projects/private-project/edit', '/projects/:id/edit'],
    ['/coloring/private-book', '/coloring/:id'],
    ['/coloring/private-book/edit', '/coloring/:id/edit'],
    ['/coloring/private-book/pages/private-page', '/coloring/:bookId/pages/:pageId'],
    ['/coloring/new', '/coloring/new'],
  ])('uses a route template for %s', (path, template) => {
    expect(sanitizeAnalyticsPath(path)).toBe(template);
  });
});
