import { chmod, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assembleBlog } from '../assemble-blog.mjs';

const temporaryDirectories = [];

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'organized-glitter-blog-'));
  temporaryDirectories.push(directory);
  const appDist = path.join(directory, 'app');
  const blogDist = path.join(directory, 'blog');
  await mkdir(path.join(blogDist, 'updates', 'example-post'), { recursive: true });
  await mkdir(appDist);
  await mkdir(path.join(blogDist, 'updates', 'contact'));
  await writeFile(
    path.join(blogDist, 'updates', 'contact', 'index.html'),
    '<main>Contact form</main>'
  );
  await writeFile(path.join(appDist, '_redirects'), '/about /about.html 200\n');
  await writeFile(path.join(appDist, 'index.html'), '<main>App shell</main>');
  await writeFile(path.join(appDist, '_headers'), '/*\n  X-Frame-Options: DENY\n');
  await writeFile(
    path.join(appDist, 'sitemap.xml'),
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://organizedglitter.app/</loc></url></urlset>'
  );
  await writeFile(path.join(blogDist, 'updates', 'index.html'), '<main>Blog index</main>');
  await writeFile(
    path.join(blogDist, 'updates', 'example-post', 'index.html'),
    '<article>Blog post</article>'
  );
  await writeFile(path.join(blogDist, 'updates', 'rss.xml'), '<rss></rss>');
  await writeFile(
    path.join(blogDist, 'updates', 'sitemap.xml'),
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://organizedglitter.app/contact</loc></url><url><loc>https://organizedglitter.app/updates/</loc></url><url><loc>https://organizedglitter.app/updates/example-post/</loc></url></urlset>'
  );
  return { appDist, blogDist };
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('blog artifact assembly', () => {
  it('adds only the blog tree and merges canonical post URLs into the root sitemap', async () => {
    const { appDist, blogDist } = await fixture();

    await assembleBlog({ appDist, blogDist, siteUrl: 'https://organizedglitter.app' });

    expect(await readFile(path.join(appDist, 'index.html'), 'utf8')).toBe('<main>App shell</main>');
    expect(await readFile(path.join(appDist, '_headers'), 'utf8')).toContain('X-Frame-Options');
    expect(
      await readFile(path.join(appDist, 'updates', 'example-post', 'index.html'), 'utf8')
    ).toBe('<article>Blog post</article>');
    const sitemap = await readFile(path.join(appDist, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('https://organizedglitter.app/contact');
    expect(await readFile(path.join(appDist, 'contact.html'), 'utf8')).toBe(
      '<main>Contact form</main>'
    );
    expect(await readFile(path.join(appDist, '_redirects'), 'utf8')).toContain(
      '/contact /contact.html 200'
    );
    expect(sitemap).toContain('https://organizedglitter.app/updates/');
    expect(sitemap).toContain('https://organizedglitter.app/updates/example-post/');
    expect(sitemap.match(/https:\/\/organizedglitter.app\//g)).toHaveLength(4);
  });

  it('rejects an existing contact page without overwriting it', async () => {
    const { appDist, blogDist } = await fixture();
    await writeFile(path.join(appDist, 'contact.html'), 'Existing contact');
    await expect(
      assembleBlog({ appDist, blogDist, siteUrl: 'https://organizedglitter.app' })
    ).rejects.toThrow(/contact/);
    expect(await readFile(path.join(appDist, 'contact.html'), 'utf8')).toBe('Existing contact');
  });

  it('rejects a missing blog feed before changing the app artifact', async () => {
    const { appDist, blogDist } = await fixture();
    await unlink(path.join(blogDist, 'updates', 'rss.xml'));
    const originalSitemap = await readFile(path.join(appDist, 'sitemap.xml'), 'utf8');

    await expect(
      assembleBlog({ appDist, blogDist, siteUrl: 'https://organizedglitter.app' })
    ).rejects.toThrow(/rss.xml/);

    expect(await readFile(path.join(appDist, 'sitemap.xml'), 'utf8')).toBe(originalSitemap);
  });

  it('rejects an existing updates path instead of overwriting an app file', async () => {
    const { appDist, blogDist } = await fixture();
    await mkdir(path.join(appDist, 'updates'));
    await writeFile(path.join(appDist, 'updates', 'index.html'), 'Existing app content');

    await expect(
      assembleBlog({ appDist, blogDist, siteUrl: 'https://organizedglitter.app' })
    ).rejects.toThrow(/updates/);

    expect(await readFile(path.join(appDist, 'updates', 'index.html'), 'utf8')).toBe(
      'Existing app content'
    );
  });

  it('removes copied blog output when the sitemap update fails', async () => {
    const { appDist, blogDist } = await fixture();
    const sitemapPath = path.join(appDist, 'sitemap.xml');
    const originalSitemap = await readFile(sitemapPath, 'utf8');
    await chmod(sitemapPath, 0o444);

    try {
      await expect(
        assembleBlog({ appDist, blogDist, siteUrl: 'https://organizedglitter.app' })
      ).rejects.toThrow();
    } finally {
      await chmod(sitemapPath, 0o644);
    }

    await expect(readFile(path.join(appDist, 'updates', 'index.html'), 'utf8')).rejects.toThrow();
    expect(await readFile(sitemapPath, 'utf8')).toBe(originalSitemap);
  });
});
