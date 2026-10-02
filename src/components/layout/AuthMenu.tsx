import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, LogOut, Download, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AvatarDisplay from '@/components/profile/AvatarDisplay';
import type { AvatarConfig } from '@/types/avatar';
import { SUBSCRIBE_TO_UPDATES_URL } from '@/constants/updates';
import { InstallAppDialog } from './InstallAppDialog';
import { useAccountMenuActions } from './useAccountMenuActions';

interface AuthMenuProps {
  avatarConfig: AvatarConfig;
  userName?: string;
  userEmail?: string;
  currentPage?: string;
}

export function AuthMenu({
  avatarConfig,
  userName,
  userEmail,
  currentPage = 'Page',
}: AuthMenuProps) {
  const { user } = useAuth();
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

  if (!user) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="hover:ring-primary/20 focus-visible:ring-ring flex size-11 items-center justify-center rounded-full transition-shadow outline-none hover:ring-2 focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <AvatarDisplay config={avatarConfig} size={32} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex items-center gap-3 p-3">
            <AvatarDisplay config={avatarConfig} size={40} />
            <div className="flex min-w-0 flex-col">
              {userName && (
                <span className="text-foreground truncate text-sm font-medium">{userName}</span>
              )}
              {userEmail && (
                <span className="text-muted-foreground truncate text-xs">{userEmail}</span>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleFeedback}>
            <Mail className="mr-2 size-4" />
            Send Feedback
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={SUBSCRIBE_TO_UPDATES_URL} target="_blank" rel="noopener noreferrer">
              <Bell className="mr-2 size-4" aria-hidden />
              Subscribe to Updates
            </a>
          </DropdownMenuItem>
          {showInstallOption && (
            <DropdownMenuItem onClick={handleInstallClick}>
              <Download className="mr-2 size-4" />
              Install Web App
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <div
            className={isSigningOut ? 'pointer-events-none' : ''}
            {...(isSigningOut ? { inert: true } : {})}
          >
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={isSigningOut}
              className="text-destructive-text focus:text-destructive-text"
            >
              <LogOut className="mr-2 size-4" />
              {isSigningOut ? 'Logging out...' : 'Logout'}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <InstallAppDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        isIOSSafari={isIOSSafari}
        isMacSafari={isMacSafari}
      />
    </>
  );
}
