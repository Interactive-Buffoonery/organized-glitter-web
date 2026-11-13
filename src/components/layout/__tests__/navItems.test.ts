import { describe, expect, it } from 'vitest';
import { isNavigationItemActive } from '../navItems';

describe('Library navigation context', () => {
  it.each([
    '/dashboard',
    '/projects/kit',
    '/projects/kit/edit',
    '/coloring',
    '/coloring/book',
    '/coloring/book/pages/page',
  ])('keeps Library active on %s', pathname => {
    expect(isNavigationItemActive('/dashboard', pathname)).toBe(true);
  });
  it.each(['/profile', '/projects-other', '/coloring-tools'])(
    'does not match unrelated path %s',
    pathname => {
      expect(isNavigationItemActive('/dashboard', pathname)).toBe(false);
    }
  );
  it('matches other sections on a path boundary', () => {
    expect(isNavigationItemActive('/notes', '/notes/new')).toBe(true);
    expect(isNavigationItemActive('/notes', '/notes-extra')).toBe(false);
  });
});
