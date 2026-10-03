import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const snapshot = JSON.parse(readFileSync(resolve(process.cwd(), '.generated/posts.json'), 'utf8'));

export const posts = snapshot.posts;
export const pages = snapshot.pages;
export const sourceOrigin = snapshot.sourceOrigin;
export const frameUrl = snapshot.frameUrl;
export const pageSize = 10;
export const pageCount = Math.max(1, Math.ceil(posts.length / pageSize));

export function postsForPage(page) {
  return posts.slice((page - 1) * pageSize, page * pageSize);
}
