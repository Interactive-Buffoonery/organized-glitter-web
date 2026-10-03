import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { AuthMenu } from './AuthMenu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { APP_NAV_ITEMS } from './navItems';
import { createAvatarConfig } from '@/utils/image/avatarUtils';
import { resolveFileUrl } from '@/lib/pocketbase';
import { getPageScrollY } from '@/utils/scrollPosition';

interface SiteHeaderProps {
  currentPage?: string;
}

/**
 * Renders the application's top header with brand link, authentication controls, and theme toggle.
 *
 * The header adjusts its visual style when the document is scrolled more than 20px.
 *
 * @param currentPage - Optional name of the current page; when `'Login'` or `'Register'` and the user is not authenticated, the header shows only the theme toggle instead of login/register buttons.
 * @returns The site header element containing the brand link, authentication/menu controls, and theme toggle.
 */
export function SiteHeader({ currentPage = '' }: SiteHeaderProps) {
  const { user } = useAuth();
  const location = useLocation();
  const isLoggedIn = !!user;
  const [logoFailed, setLogoFailed] = useState(false);
  const [scrolled, setScrolled] = useState(() => getPageScrollY() > 20);

  useEffect(() => {
    const handleScroll = () => setScrolled(getPageScrollY() > 20);

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isAuthPage = currentPage === 'Login' || currentPage === 'Register';
  const shouldShowMobileBrandTitle = isLoggedIn || isAuthPage || logoFailed;

  const avatarConfig = useMemo(() => {
    if (!user) return undefined;
    return createAvatarConfig({
      avatar_url: user.avatar ? resolveFileUrl('users', user.id, user.avatar) : null,
      email: user.email,
      username: user.name || user.username,
    });
  }, [user]);

  return (
    <header
      className={cn(
        'site-header-safe-area sticky top-0 z-40 transition-colors duration-200',
        scrolled
          ? 'border-border bg-background/90 border-b backdrop-blur-md'
          : 'border-border bg-background/90 border-b backdrop-blur-md sm:border-b-0 sm:bg-transparent sm:backdrop-blur-none'
      )}
      aria-label="Site header"
    >
      <div className="relative container mx-auto flex items-center justify-between p-4">
        <Link
          to="/"
          className="focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Organized Glitter home"
        >
          <img
            src="/images/logo.png"
            alt=""
            aria-hidden
            hidden={logoFailed}
            onError={() => setLogoFailed(true)}
            className="size-8 flex-shrink-0 object-contain"
          />
          <span
            className={cn(
              'font-handwritten text-foreground text-2xl whitespace-nowrap',
              shouldShowMobileBrandTitle ? 'inline' : 'hidden sm:inline'
            )}
          >
            Organized Glitter
          </span>
        </Link>

        {isLoggedIn && (
          <nav
            aria-label="Primary navigation"
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex"
          >
            {APP_NAV_ITEMS.map(({ path, label }) => {
              const isActive =
                path === '/dashboard'
                  ? location.pathname === '/dashboard' || location.pathname === '/coloring'
                  : location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-sm font-semibold tracking-tight transition-colors',
                    isActive
                      ? 'bg-primary/8 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {isLoggedIn && avatarConfig ? (
            <>
              <div className="hidden items-center gap-2 lg:flex">
                <AuthMenu
                  avatarConfig={avatarConfig}
                  userName={user?.name || user?.username}
                  userEmail={user?.email}
                  currentPage={currentPage}
                />
                <ThemeToggle />
              </div>
            </>
          ) : isAuthPage ? (
            <ThemeToggle />
          ) : (
            <>
              <Button asChild variant="ghost" className="text-foreground/80 hover:text-foreground">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild variant="glass" className="hidden font-medium sm:inline-flex">
                <Link to="/register">Get Started</Link>
              </Button>
              <ThemeToggle />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
