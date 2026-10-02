import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('updates links', () => {
  it('keeps the WordPress URL when the blog is disabled', async () => {
    vi.stubEnv('VITE_BLOG_ENABLED', 'false');
    vi.resetModules();

    const links = await import('../updates');

    expect(links.UPDATES_URL).toBe('https://updates.organizedglitter.app/');
    expect(links.SUBSCRIBE_TO_UPDATES_URL).toBe('https://updates.organizedglitter.app/#subscribe');
  });

  it('links to the integrated blog when the build enables it', async () => {
    vi.stubEnv('VITE_BLOG_ENABLED', 'true');
    vi.resetModules();

    const links = await import('../updates');

    expect(links.UPDATES_URL).toBe('/updates/');
    expect(links.SUBSCRIBE_TO_UPDATES_URL).toBe('/updates/#subscribe');
  });
});
