import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { showUserReportDialog } from '@/components/FeedbackDialogStore';
import { useAuth } from '@/hooks/useAuth';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { notify } from '@/lib/notifications';
import { logger } from '@/utils/logger';
import { confirmAccountDraftRemoval } from '@/hooks/drafts/confirmAccountDraftRemoval';
import { isMacOSSafari, shouldShowIOSInstallPrompt } from '@/utils/ui/deviceDetection';

export type AccountMenuActions = {
  isSigningOut: boolean;
  showInstallOption: boolean;
  showInstallDialog: boolean;
  setShowInstallDialog: (open: boolean) => void;
  isIOSSafari: boolean;
  isMacSafari: boolean;
  handleFeedback: () => void;
  handleInstallClick: () => Promise<void>;
  handleLogout: () => Promise<void>;
};

export function useAccountMenuActions(currentPage = 'Page'): AccountMenuActions {
  const navigate = useNavigate();
  const { user, signOut: authSignOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const signOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isInstalled, promptInstall, isInstallable } = usePWAInstall();
  const isIOSSafari = shouldShowIOSInstallPrompt();
  const isMacSafari = isMacOSSafari();
  const showInstallOption = !isInstalled;

  useEffect(() => {
    return () => {
      if (signOutTimeoutRef.current) {
        clearTimeout(signOutTimeoutRef.current);
      }
    };
  }, []);

  const handleFeedback = useCallback(() => {
    showUserReportDialog({
      title: 'Share Your Feedback',
      subtitle: "We'd love to hear what you think about Organized Glitter!",
      currentPage,
    });
  }, [currentPage]);

  const handleInstallClick = useCallback(async () => {
    if (isInstallable) {
      try {
        await promptInstall();
        return;
      } catch {
        // User dismissed or prompt failed; fall through to manual instructions.
      }
    }
    setShowInstallDialog(true);
  }, [isInstallable, promptInstall]);

  const handleLogout = useCallback(async () => {
    try {
      if (isSigningOut) return;
      if (
        !confirmAccountDraftRemoval(
          user?.id,
          'Signing out will remove unfinished drafts saved on this device. Continue?'
        )
      )
        return;

      setIsSigningOut(true);

      if (authSignOut) {
        const result = await authSignOut();

        if (result.success) {
          notify({
            kind: 'info',
            title: 'Logged out',
            description: 'You have been successfully logged out.',
          });

          navigate('/login', { replace: true });
        } else {
          notify({
            kind: 'error',
            title: 'Logout Failed',
            description: result.error?.message || 'An unexpected error occurred during logout.',
          });
        }
      } else {
        notify({
          kind: 'error',
          title: 'Logout Failed',
          description: 'Logout function is not available. Please try again later.',
        });
      }
    } catch (error) {
      logger.error('Logout error:', error);
      notify({
        kind: 'error',
        title: 'Logout Failed',
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      if (signOutTimeoutRef.current) {
        clearTimeout(signOutTimeoutRef.current);
      }
      const timer = setTimeout(() => {
        setIsSigningOut(false);
        signOutTimeoutRef.current = null;
      }, 1000);
      signOutTimeoutRef.current = timer;
    }
  }, [isSigningOut, authSignOut, navigate, user?.id]);

  return {
    isSigningOut,
    showInstallOption,
    showInstallDialog,
    setShowInstallDialog,
    isIOSSafari,
    isMacSafari,
    handleFeedback,
    handleInstallClick,
    handleLogout,
  };
}
