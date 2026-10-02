import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Bell,
  BookOpenText,
  ChartColumn,
  Check,
  Download,
  LogOut,
  Mail,
  Menu,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUBSCRIBE_TO_UPDATES_URL } from '@/constants/updates';

import AvatarDisplay from '@/components/profile/AvatarDisplay';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateThemePreferenceMutation } from '@/hooks/mutations/useUpdateThemePreferenceMutation';
import { THEME_OPTIONS, isAppTheme, resolveThemePreference } from '@/lib/theme';
import type { AppTheme } from '@/lib/theme';
import type { AvatarConfig } from '@/types/avatar';
import { InstallAppDialog } from './InstallAppDialog';
import { useAccountMenuActions } from './useAccountMenuActions';

interface MobileAccountMenuProps {
  avatarConfig: AvatarConfig;
  userName?: string;
  userEmail?: string;
  currentPage?: string;
  triggerVariant?: 'header' | 'bottom-nav';
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground px-1 text-xs font-semibold">{title}</h3>
      <div className="border-border/60 bg-card overflow-hidden rounded-lg border">{children}</div>
    </section>
  );
}

function MenuLink({
  to,
  children,
  onSelect,
}: {
  to: string;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-3 px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
    </Link>
  );
}

export function MobileAccountMenu({
  avatarConfig,
  userName,
  userEmail,
  currentPage = 'Page',
  triggerVariant = 'header',
}: MobileAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { mutate: updateThemePreference } = useUpdateThemePreferenceMutation();
  const {
    isSigningOut,
    showInstallOption,
    showInstallDialog,
    setShowInstallDialog,
    isIOSSafari,
    isMacSafari,
    handleFeedback,
    handleInstallClick,
    handleLogout,
  } = useAccountMenuActions(currentPage);

  const closeDrawer = () => setOpen(false);

  const selectTheme = (value: string) => {
    if (!isAppTheme(value)) return;
    const nextTheme: AppTheme = value;
    setTheme(nextTheme);
    if (user) {
      updateThemePreference({ userId: user.id, themePreference: nextTheme });
    }
  };

  const runAndClose = async (action: () => void | Promise<void>) => {
    await action();
    closeDrawer();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          triggerVariant === 'bottom-nav'
            ? 'text-muted-foreground h-auto min-h-[44px] min-w-[44px] flex-col gap-0 rounded-xl px-3 py-2 [&_svg]:size-6'
            : 'h-11 gap-2 rounded-full px-2 pr-3'
        )}
        onClick={() => setOpen(true)}
        aria-label="Open account menu"
      >
        {triggerVariant === 'bottom-nav' ? (
          <>
            <Menu className="mb-1" aria-hidden />
            <span className="text-xs leading-none font-medium">Menu</span>
          </>
        ) : (
          <>
            <AvatarDisplay config={avatarConfig} size={28} />
            <Menu className="size-4" aria-hidden />
            <span className="text-sm font-medium">Menu</span>
          </>
        )}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[70dvh]">
          <DrawerDescription className="sr-only">
            Account, app, help, and session actions.
          </DrawerDescription>
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between gap-4 px-4 pt-2 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <AvatarDisplay config={avatarConfig} size={44} />
                <div className="min-w-0">
                  <DrawerTitle className="text-lg font-semibold">Account menu</DrawerTitle>
                  {userName && (
                    <p className="text-foreground truncate text-sm font-medium">{userName}</p>
                  )}
                  {userEmail && (
                    <p className="text-muted-foreground truncate text-xs">{userEmail}</p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                className="shrink-0"
                onClick={closeDrawer}
                aria-label="Close account menu"
              >
                <X className="size-5" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
              <MenuSection title="Account">
                <MenuLink to="/notes" onSelect={closeDrawer}>
                  <BookOpenText className="text-primary size-4" aria-hidden />
                  Notes
                </MenuLink>
                <MenuLink to="/profile" onSelect={closeDrawer}>
                  <Settings className="text-primary size-4" aria-hidden />
                  Profile & settings
                </MenuLink>
                <MenuLink to="/options" onSelect={closeDrawer}>
                  <SlidersHorizontal className="text-primary size-4" aria-hidden />
                  Manage Lists
                </MenuLink>
                <MenuLink to="/stats" onSelect={closeDrawer}>
                  <ChartColumn className="text-primary size-4" aria-hidden />
                  Stats
                </MenuLink>
              </MenuSection>

              <MenuSection title="Appearance">
                <div className="px-4 py-3">
                  <Select value={resolveThemePreference(theme)} onValueChange={selectTheme}>
                    <SelectTrigger aria-label="Theme" className="min-h-11">
                      <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {THEME_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </MenuSection>

              <MenuSection title="App">
                {SUBSCRIBE_TO_UPDATES_URL && (
                  <a
                    href={SUBSCRIBE_TO_UPDATES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeDrawer}
                    className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-3 px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Bell className="text-primary size-4" aria-hidden />
                    Subscribe to Updates
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => runAndClose(handleFeedback)}
                  className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Mail className="text-primary size-4" aria-hidden />
                  Send feedback
                </button>
                {showInstallOption && (
                  <button
                    type="button"
                    onClick={() => runAndClose(handleInstallClick)}
                    className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 border-t px-4 py-3 text-left text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Download className="text-primary size-4" aria-hidden />
                    Install Web App
                  </button>
                )}
              </MenuSection>
            </div>

            <footer className="bg-background border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive-text hover:text-destructive-text w-full justify-start"
                onClick={() => runAndClose(handleLogout)}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <>
                    <Check className="size-4" />
                    Logging out…
                  </>
                ) : (
                  <>
                    <LogOut className="size-4" />
                    Logout
                  </>
                )}
              </Button>
            </footer>
          </div>
        </DrawerContent>
      </Drawer>

      <InstallAppDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        isIOSSafari={isIOSSafari}
        isMacSafari={isMacSafari}
      />
    </>
  );
}
