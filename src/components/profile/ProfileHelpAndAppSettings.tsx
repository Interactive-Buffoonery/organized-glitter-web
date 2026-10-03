import { Download, Mail } from 'lucide-react';

import { InstallAppDialog } from '@/components/layout/InstallAppDialog';
import { useAccountMenuActions } from '@/components/layout/useAccountMenuActions';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';

interface ProfileHelpAndAppSettingsProps {
  currentPage?: string;
}

export function ProfileHelpAndAppSettings({
  currentPage = 'Profile',
}: ProfileHelpAndAppSettingsProps) {
  const {
    showInstallOption,
    showInstallDialog,
    setShowInstallDialog,
    isIOSSafari,
    isMacSafari,
    handleFeedback,
    handleInstallClick,
  } = useAccountMenuActions(currentPage);

  return (
    <>
      <GlassPanel className="mt-8">
        <div className="border-border border-b p-6">
          <h2 className="text-xl font-semibold">Help & app</h2>
          <p className="text-muted-foreground">
            App utilities and help links are available here for mobile access.
          </p>
        </div>

        <div className="divide-border/60 divide-y p-6">
          <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-medium">
                <Mail className="text-primary size-4" aria-hidden />
                Send feedback
              </h3>
              <p className="text-muted-foreground text-sm">
                Share bugs, ideas, or rough edges from the app.
              </p>
            </div>
            <Button type="button" variant="glass" onClick={handleFeedback} className="sm:shrink-0">
              Send feedback
            </Button>
          </div>

          {showInstallOption && (
            <div className="flex flex-col gap-3 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-medium">
                  <Download className="text-primary size-4" aria-hidden />
                  Install Web App
                </h3>
                <p className="text-muted-foreground text-sm">
                  Add Organized Glitter to your home screen or app launcher.
                </p>
              </div>
              <Button
                type="button"
                variant="glass"
                onClick={handleInstallClick}
                className="sm:shrink-0"
              >
                Install Web App
              </Button>
            </div>
          )}
        </div>
      </GlassPanel>

      <InstallAppDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        isIOSSafari={isIOSSafari}
        isMacSafari={isMacSafari}
      />
    </>
  );
}
