/**
 * Bottom navigation bar component for mobile and tablet devices
 * @author @serabi
 * @created 2025-07-29
 */

import { memo, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, LibraryBig, Plus, Shuffle } from 'lucide-react';
import { NoteTargetPicker } from '@/components/notes-feed/NoteTargetPicker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMobileDevice } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { resolveFileUrl } from '@/lib/pocketbase';
import { createAvatarConfig } from '@/utils/image/avatarUtils';
import { createLogger } from '@/utils/logger';
import { MobileAccountMenu } from './MobileAccountMenu';
import type { LucideIcon } from 'lucide-react';

interface NavigationItem {
  label: string;
  icon: LucideIcon;
  path: string;
  /** When true, apply a subtle always-on accent so the item reads as a primary action. */
  accent?: boolean;
  /** Optional override for the `Navigate to {label}` aria-label template. */
  ariaLabel?: string;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: 'Overview', icon: Home, path: '/overview' },
  { label: 'Library', icon: LibraryBig, path: '/dashboard' },
  { label: 'Randomizer', icon: Shuffle, path: '/randomizer' },
];

const logger = createLogger('BottomNavigation');

const BottomNavigation = memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    diamond_painting,
    coloring_books,
    isLoading: isLoadingVerticals,
  } = useEnabledVerticals(user?.id);
  const { isMobile, isTablet } = useMobileDevice();
  const [pickerOpen, setPickerOpen] = useState(false);

  const show = isMobile || isTablet;
  useEffect(() => {
    if (!show) return;
    document.body.classList.add('has-bottom-nav');
    return () => {
      document.body.classList.remove('has-bottom-nav');
    };
  }, [show]);

  // Only show on mobile and tablet devices (< 1024px)
  if (!show) {
    return null;
  }

  const handleNavClick = (targetPath: string, linkName: string) => {
    logger.info(`Bottom navigation clicked: ${linkName}`, {
      from: location.pathname,
      to: targetPath,
      linkName,
      timestamp: new Date().toISOString(),
    });
  };

  const hasDiamondEnabled = diamond_painting;
  const hasColoringEnabled = coloring_books;
  const enabledVerticals = {
    diamond_painting: hasDiamondEnabled,
    coloring_books: hasColoringEnabled,
  };
  const showAddButton = !isLoadingVerticals && (hasDiamondEnabled || hasColoringEnabled);
  const avatarConfig = createAvatarConfig({
    avatar_url: user?.avatar ? resolveFileUrl('users', user.id, user.avatar) : null,
    email: user?.email,
    username: user?.name || user?.username,
  });

  const navigateTo = (targetPath: string, linkName: string) => {
    handleNavClick(targetPath, linkName);
    navigate(targetPath);
  };

  return (
    <>
      <nav
        aria-label="Bottom navigation"
        className="border-border bg-background/90 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-md"
      >
        <div className="flex h-[var(--bottom-nav-content-height)] items-center justify-around px-2">
          {NAVIGATION_ITEMS.slice(0, 2).map(({ label, icon: Icon, path, ariaLabel }) => {
            const isActive = location.pathname === path;

            return (
              <Button
                key={path}
                asChild
                variant="ghost"
                className={`h-auto min-h-[44px] min-w-[44px] flex-col gap-0 rounded-xl px-3 py-2 [&_svg]:size-6 ${
                  isActive
                    ? 'bg-primary/12 hover:bg-primary/12 text-primary hover:text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Link
                  to={path}
                  onClick={() => handleNavClick(path, label)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={ariaLabel ?? `Navigate to ${label}`}
                >
                  <Icon className="mb-1" />
                  <span className="text-xs leading-none font-medium">{label}</span>
                </Link>
              </Button>
            );
          })}

          {showAddButton ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary h-auto min-h-[44px] min-w-[44px] flex-col gap-0 rounded-full px-3 py-2 [&_svg]:size-6"
                  aria-label="Add new item"
                >
                  <Plus className="mb-1" />
                  <span className="text-xs leading-none font-medium">Add</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="center"
                sideOffset={10}
                className="mb-1 w-56 rounded-lg p-1"
              >
                {hasDiamondEnabled ? (
                  <DropdownMenuItem
                    className="min-h-12 text-base"
                    onSelect={() => navigateTo('/projects/new', 'Add -> New diamond painting')}
                  >
                    New diamond painting
                  </DropdownMenuItem>
                ) : null}
                {hasColoringEnabled ? (
                  <DropdownMenuItem
                    className="min-h-12 text-base"
                    onSelect={() =>
                      navigateTo('/projects/new?craft=coloring', 'Add -> New coloring book')
                    }
                  >
                    New coloring book
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="min-h-12 text-base"
                  onSelect={() => {
                    handleNavClick(location.pathname, 'Add -> Add a progress note');
                    setPickerOpen(true);
                  }}
                >
                  Add a progress note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {NAVIGATION_ITEMS.slice(2).map(({ label, icon: Icon, path, ariaLabel }) => {
            const isActive = location.pathname === path;

            return (
              <Button
                key={path}
                asChild
                variant="ghost"
                className={`h-auto min-h-[44px] min-w-[44px] flex-col gap-0 rounded-xl px-3 py-2 [&_svg]:size-6 ${
                  isActive
                    ? 'bg-primary/12 hover:bg-primary/12 text-primary hover:text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Link
                  to={path}
                  onClick={() => handleNavClick(path, label)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={ariaLabel ?? `Navigate to ${label}`}
                >
                  <Icon className="mb-1" />
                  <span className="text-xs leading-none font-medium">{label}</span>
                </Link>
              </Button>
            );
          })}
          <MobileAccountMenu
            avatarConfig={avatarConfig}
            userName={user?.name || user?.username}
            userEmail={user?.email}
            currentPage="Bottom navigation"
            triggerVariant="bottom-nav"
          />
        </div>
        <div className="h-[var(--bottom-nav-safe-area)]" />
      </nav>

      <NoteTargetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        verticals={enabledVerticals}
      />
    </>
  );
});

BottomNavigation.displayName = 'BottomNavigation';

export default BottomNavigation;
