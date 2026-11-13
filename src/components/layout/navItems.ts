export const APP_NAV_ITEMS = [
  { path: '/overview', label: 'Overview' },
  { path: '/dashboard', label: 'Library' },
  { path: '/notes', label: 'Notes' },
  { path: '/randomizer', label: 'Randomizer' },
  { path: '/stats', label: 'Stats' },
  { path: '/options', label: 'Manage Lists' },
  { path: '/profile', label: 'Settings' },
] as const;

export function isNavigationItemActive(path: string, pathname: string): boolean {
  const roots = path === '/dashboard' ? ['/dashboard', '/projects', '/coloring'] : [path];
  return roots.some(root => pathname === root || pathname.startsWith(`${root}/`));
}
