import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('updates links', () => {
  it('has no external destination without operator configuration', async () => {
    vi.stubEnv('VITE_UPDATES_URL', '');
    vi.resetModules();
    const links = await import('../updates');
    expect(links.UPDATES_URL).toBeNull();
    expect(links.SUBSCRIBE_TO_UPDATES_URL).toBeNull();
  });

  it('retains configured official-site updates and subscribe behavior', async () => {
    vi.stubEnv('VITE_UPDATES_URL', 'https://updates.example.test/');
    vi.resetModules();
    const links = await import('../updates');
    expect(links.UPDATES_URL).toBe('https://updates.example.test/');
    expect(links.SUBSCRIBE_TO_UPDATES_URL).toBe('https://updates.example.test/#subscribe');
  });

  it('rejects non-HTTP links', async () => {
    vi.stubEnv('VITE_UPDATES_URL', 'javascript:alert(1)');
    vi.resetModules();
    expect((await import('../updates')).UPDATES_URL).toBeNull();
  });
});
