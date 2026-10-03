import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, analyticsProxyTarget } from './deployment-config.js';

// Failures: official defaults, custom backend blocked, invalid URL becoming a
// CSP directive, disabled proxy sending traffic, path escaping configured host.
describe('deployment boundaries', () => {
  it('has no official backend, payment, image proxy, or analytics defaults', () => {
    const policy = buildContentSecurityPolicy({});
    expect(policy).not.toMatch(/organizedglitter|paypal|posthog|workers\.dev|\*\./);
    expect(analyticsProxyTarget(new URL('https://app.example.test/glimmer/e/'), {})).toBeNull();
  });

  it('allows only the configured backend origin in production', () => {
    const policy = buildContentSecurityPolicy({
      VITE_POCKETBASE_URL: 'https://data.example.test/api',
    });
    expect(policy).toContain("connect-src 'self' https://data.example.test");
    expect(policy).toContain("img-src 'self' https://data.example.test");
    expect(policy).not.toContain('https://data.example.test/api');
  });

  it.each([
    'javascript:alert(1)',
    'https://user:pass@data.example.test',
    'https://data.example.test; script-src *',
  ])('rejects unsafe configured origins: %s', value => {
    expect(() => buildContentSecurityPolicy({ VITE_POCKETBASE_URL: value })).toThrow();
  });

  it('uses explicit ingest and asset hosts and never escapes their origin', () => {
    const env = {
      POSTHOG_PROXY_HOST: 'https://analytics.example.test',
      POSTHOG_PROXY_ASSET_HOST: 'https://assets.example.test',
    };
    expect(
      analyticsProxyTarget(new URL('https://app.example.test/glimmer/e/?v=3'), env)?.href
    ).toBe('https://analytics.example.test/e/?v=3');
    expect(
      analyticsProxyTarget(new URL('https://app.example.test/glimmer/static/array.js'), env)?.href
    ).toBe('https://assets.example.test/static/array.js');
    expect(
      analyticsProxyTarget(new URL('https://app.example.test/glimmer//evil.example/x'), env)
    ).toBeNull();
  });
});

it('allows only explicit external image origins for a configured site', () => {
  expect(
    buildContentSecurityPolicy({
      PUBLIC_IMAGE_ORIGINS: 'https://media.example.test,https://photos.example.test',
    })
  ).toContain('https://media.example.test https://photos.example.test');
  expect(() =>
    buildContentSecurityPolicy({ PUBLIC_IMAGE_ORIGINS: 'https://*.example.test' })
  ).toThrow();
});

it('escapes a backend origin for exact service-worker matching', async () => {
  const { escapeOriginForRegExp } = await import('./deployment-config.js');
  const pattern = new RegExp(`^${escapeOriginForRegExp('https://data.example.test')}/api/files/`);
  expect(pattern.test('https://data.example.test/api/files/x')).toBe(true);
  expect(pattern.test('https://dataXexampleXtest/api/files/x')).toBe(false);
});
