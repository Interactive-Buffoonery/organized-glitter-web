import { cp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { configuredOrigin } from '../server/deployment-config.js';

function sitemapEntries(xml, label, canonicalOrigin) {
  if (!/<urlset\b[^>]*>/.test(xml) || !/<\/urlset>\s*$/.test(xml)) {
    throw new Error(`${label} must be a URL sitemap`);
  }

  const entries = [...xml.matchAll(/<url\b[^>]*>[\s\S]*?<\/url>/g)].map(match => match[0]);
  if (entries.length === 0) throw new Error(`${label} has no URLs`);

  return entries.map(entry => {
    const location = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!location) throw new Error(`${label} has a URL without a location`);
    let url;
    try {
      url = new URL(location);
    } catch {
      throw new Error(`${label} has an invalid URL`);
    }
    if (url.href !== location || url.origin !== canonicalOrigin || url.search || url.hash) {
      throw new Error(`${label} has a noncanonical URL: ${location}`);
    }
    return { entry, location, pathname: url.pathname };
  });
}

async function requireFile(filePath) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new Error(`Missing blog build file: ${filePath}`);
  }
  if (!info.isFile()) throw new Error(`Expected blog build file: ${filePath}`);
}

export async function assembleBlog({
  appDist,
  blogDist,
  siteUrl = process.env.VITE_APP_URL || 'http://localhost:3000',
}) {
  const canonicalOrigin = configuredOrigin(siteUrl);
  const blogRoot = path.join(blogDist, 'updates');
  const appBlogRoot = path.join(appDist, 'updates');
  for (const name of ['index.html', 'rss.xml', 'sitemap.xml']) {
    await requireFile(path.join(blogRoot, name));
  }
  await requireFile(path.join(appDist, 'index.html'));
  const contactSource = path.join(blogRoot, 'contact', 'index.html');
  const contactTarget = path.join(appDist, 'contact.html');
  await requireFile(contactSource);
  try {
    await stat(contactTarget);
    throw new Error(`App output already contains ${contactTarget}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const redirectsPath = path.join(appDist, '_redirects');
  const redirects = await readFile(redirectsPath, 'utf8');

  try {
    await stat(appBlogRoot);
    throw new Error(`App output already contains ${appBlogRoot}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const rootSitemapPath = path.join(appDist, 'sitemap.xml');
  const rootSitemap = await readFile(rootSitemapPath, 'utf8');
  const blogSitemap = await readFile(path.join(blogRoot, 'sitemap.xml'), 'utf8');
  const existing = sitemapEntries(rootSitemap, 'App sitemap', canonicalOrigin);
  const blog = sitemapEntries(blogSitemap, 'Blog sitemap', canonicalOrigin);
  const locations = new Set(existing.map(({ location }) => location));
  for (const { location, pathname } of blog) {
    if ((pathname !== '/contact' && !pathname.startsWith('/updates/')) || locations.has(location)) {
      throw new Error(`Blog sitemap has an invalid or duplicate URL: ${location}`);
    }
    locations.add(location);
  }

  const combinedSitemap = rootSitemap.replace(
    /<\/urlset>\s*$/,
    `${blog.map(({ entry }) => entry).join('\n')}\n</urlset>`
  );
  try {
    await cp(blogRoot, appBlogRoot, { recursive: true, errorOnExist: true, force: false });
    await cp(contactSource, contactTarget, { errorOnExist: true, force: false });
    await writeFile(
      redirectsPath,
      `${redirects.trimEnd()}\n/contact /contact.html 200\n/contact/ /contact.html 200\n`
    );
    await writeFile(rootSitemapPath, combinedSitemap);
  } catch (error) {
    await rm(appBlogRoot, { recursive: true, force: true });
    await rm(contactTarget, { force: true });
    await writeFile(redirectsPath, redirects);
    throw error;
  }
}
