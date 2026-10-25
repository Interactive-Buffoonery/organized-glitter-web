import { sanitizeSensitivePath } from '@/utils/auth/sensitivePath';

export function sanitizeAnalyticsPath(pathname: string): string {
  const path = sanitizeSensitivePath(pathname);
  if (/^\/(projects|coloring)\/new\/?$/i.test(path)) return path.replace(/\/$/, '');

  const page = path.match(/^\/coloring\/[^/]+\/pages\/[^/]+(\/colors)?\/?$/i);
  if (page) return `/coloring/:bookId/pages/:pageId${page[1] ? '/colors' : ''}`;

  const detail = path.match(/^\/(projects|coloring)\/[^/]+(\/edit)?\/?$/i);
  if (detail) return `/${detail[1].toLowerCase()}/:id${detail[2] ? '/edit' : ''}`;

  return path;
}
