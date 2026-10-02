import { mkdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { mailpoetIframeUrl, normalizePosts, normalizePages } from '../src/lib/content.mjs';
import {
  fetchPublishedPosts,
  fetchPublishedPages,
  wordpressApiUrl,
} from '../src/lib/wordpress.mjs';

const apiUrl = process.env.WORDPRESS_API_URL;
const sourceOrigin = apiUrl ? wordpressApiUrl(apiUrl).origin : 'https://content.invalid';
const frameUrl = mailpoetIframeUrl(process.env.MAILPOET_IFRAME_URL, sourceOrigin);
const [rawPosts, rawPages] = apiUrl
  ? await Promise.all([fetchPublishedPosts({ apiUrl }), fetchPublishedPages({ apiUrl })])
  : [[], []];
const posts = normalizePosts(rawPosts, sourceOrigin);
const pages = apiUrl ? normalizePages(rawPages, sourceOrigin) : [];
const snapshot = { posts, pages, sourceOrigin, frameUrl };
const generatedDir = fileURLToPath(new URL('../.generated/', import.meta.url));
const target = fileURLToPath(new URL('../.generated/posts.json', import.meta.url));
const temporary = `${target}.${process.pid}.tmp`;

await mkdir(generatedDir, { recursive: true });
await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, 'utf8');
await rename(temporary, target);
console.info(`Prepared ${posts.length} published WordPress posts for the Astro build`);
