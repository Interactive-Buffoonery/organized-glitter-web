import { sanitizeSensitivePath } from '@/utils/auth/sensitivePath';

export function sanitizeAnalyticsPath(pathname: string): string {
  const path = sanitizeSensitivePath(pathname);
  if (/^\/(projects|coloring)\/new\/?$/i.test(path)) return path.replace(/\/$/, '');

  if (/^\/coloring\/[^/]+\/pages\/[^/]+\/?$/i.test(path)) {
    return '/coloring/:bookId/pages/:pageId';
  }

  const detail = path.match(/^\/(projects|coloring)\/[^/]+(\/edit)?\/?$/i);
  if (detail) return `/${detail[1].toLowerCase()}/:id${detail[2] ? '/edit' : ''}`;

  return path;
}
