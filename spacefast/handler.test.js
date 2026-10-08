import { describe, expect, it } from 'vitest';
import handler from './handler.js';

describe('Spacefast app routes', () => {
  it.each([
    '/dashboard',
    '/projects/record123',
    '/coloring/book123/pages/page456',
    '/auth/verify-email/token.with.dots',
    '/auth/confirm-email-change/token.with.dots',
  ])('serves the app shell for %s', async pathname => {
    const response = await handler.fetch(new Request(`https://example.com${pathname}`), {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBeTruthy();
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('permissions-policy')).toBeTruthy();
    expect(await response.text()).toContain('id="root"');
  });

  it('serves the static landing, not the app shell, at the root', async () => {
    const response = await handler.fetch(new Request('https://example.com/'), {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    const body = await response.text();
    expect(body).toContain('data-static-landing');
    expect(body).not.toContain('id="root"');
  });

  it('returns a useful HTML 404 for an unknown public path', async () => {
    const response = await handler.fetch(new Request('https://example.com/no-such-page-xyz'), {});
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toBeTruthy();
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(await response.text()).toContain('data-error="page-not-found"');
  });

  it.each(['/assets/chunk-abc.js', '/missing.css', '/.well-known/apple-app-site-association'])(
    'returns a plain 404 for a missing static file at %s',
    async pathname => {
      const response = await handler.fetch(new Request(`https://example.com${pathname}`), {});
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toBeTruthy();
      expect(response.headers.get('permissions-policy')).toBeTruthy();
      expect(await response.text()).toBe('Not found');
    }
  );

  it('returns an empty plain 404 for a missing static file on HEAD', async () => {
    const response = await handler.fetch(
      new Request('https://example.com/assets/chunk-abc.js', { method: 'HEAD' }),
      {}
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('');
  });

  it('keeps unknown API paths as JSON 404s', async () => {
    const response = await handler.fetch(new Request('https://example.com/api/missing'), {});
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('does not expose the retired feedback route', async () => {
    const response = await handler.fetch(
      new Request('https://example.com/api/send-feedback', { method: 'POST' })
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});
