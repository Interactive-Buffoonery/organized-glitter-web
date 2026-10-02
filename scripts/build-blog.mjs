import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadEnv } from 'vite';

import { assembleBlog } from './assemble-blog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const env = { ...loadEnv('production', root, ''), ...process.env };

if (env.BLOG_ENABLED === 'true') {
  const result = spawnSync('pnpm', ['--dir', 'blog', 'build'], {
    cwd: root,
    env: {
      ...env,
      BLOG_NAVIGATION_MANIFEST: path.join(root, 'dist', 'manifest.json'),
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  await assembleBlog({
    appDist: path.join(root, 'dist'),
    blogDist: path.join(root, 'blog', 'dist'),
    siteUrl: env.VITE_APP_URL,
  });
}
