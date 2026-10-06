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
  vi.stubEnv('VITE_APP_URL', undefined);
  await import('../build-blog.mjs');
  expect(mocks.spawn).toHaveBeenCalledTimes(1);
  const [command, args, options] = mocks.spawn.mock.calls[0];
  expect(command).toBe('pnpm');
  expect(args).toEqual(['--dir', 'blog', 'build']);
  expect({
    BLOG_ENABLED: options.env.BLOG_ENABLED,
    VITE_APP_URL: options.env.VITE_APP_URL,
  }).toEqual({
    BLOG_ENABLED: 'true',
    VITE_APP_URL: 'https://site.example.test',
  });
  expect(mocks.assemble).toHaveBeenCalledWith(
    expect.objectContaining({ siteUrl: 'https://site.example.test' })
  );
});
