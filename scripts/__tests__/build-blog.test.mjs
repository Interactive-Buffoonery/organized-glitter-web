import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(() => ({ status: 0 })), assemble: vi.fn() }));
vi.mock('node:child_process', () => ({
  default: { spawnSync: mocks.spawn },
  spawnSync: mocks.spawn,
}));
vi.mock('vite', () => ({
  loadEnv: () => ({ BLOG_ENABLED: 'true', VITE_APP_URL: 'https://site.example.test' }),
}));
vi.mock('../assemble-blog.mjs', () => ({ assembleBlog: mocks.assemble }));
afterEach(() => vi.unstubAllEnvs());

it('uses the same root environment file for Vite and the Astro build', async () => {
  vi.stubEnv('BLOG_ENABLED', undefined);
  await import('../build-blog.mjs');
  expect(mocks.spawn).toHaveBeenCalledWith(
    'pnpm',
    ['--dir', 'blog', 'build'],
    expect.objectContaining({
      env: expect.objectContaining({
        BLOG_ENABLED: 'true',
        VITE_APP_URL: 'https://site.example.test',
      }),
    })
  );
  expect(mocks.assemble).toHaveBeenCalledWith(
    expect.objectContaining({ siteUrl: 'https://site.example.test' })
  );
});
