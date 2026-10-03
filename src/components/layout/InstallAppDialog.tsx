import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Share } from 'lucide-react';

export interface InstallAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isIOSSafari: boolean;
  isMacSafari: boolean;
}

export function InstallAppDialog({
  open,
  onOpenChange,
  isIOSSafari,
  isMacSafari,
}: InstallAppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Install Organized Glitter</DialogTitle>
          <DialogDescription>
            {isIOSSafari
              ? 'Add this app to your home screen for quick access.'
              : isMacSafari
                ? 'Add this app to your Dock for quick access.'
                : 'Install Organized Glitter as an app for quick access from your home screen or app launcher.'}
          </DialogDescription>
        </DialogHeader>
        {isIOSSafari || isMacSafari ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3 text-sm">
              <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-full text-xs font-semibold">
                1
              </div>
              <div className="flex items-center gap-2">
                <span>Tap the</span>
                <span className="bg-muted inline-flex items-center rounded px-2 py-1">
                  <Share className="size-3" />
                </span>
                <span>share button</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-full text-xs font-semibold">
                2
              </div>
              <div className="flex items-center gap-2">
                <span>Select</span>
                <span className="bg-muted inline-flex items-center gap-1 rounded px-2 py-1">
                  <Plus className="size-3" />
                  <span className="text-xs">
                    {isIOSSafari ? 'Add to Home Screen' : 'Add to Dock'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground space-y-2 py-2 text-sm">
            <p>
              Open your browser's menu and look for an option like{' '}
              <span className="text-foreground font-medium">Install app</span>,{' '}
              <span className="text-foreground font-medium">Install Organized Glitter</span>, or{' '}
              <span className="text-foreground font-medium">Add to Home screen</span>.
            </p>
            <p>
              On Chrome and Edge, look for an install icon in the address bar. The option may only
              appear once you've used the site for a few moments.
            </p>
          </div>
        )}
        <Button
          type="button"
          onClick={() => onOpenChange(false)}
          variant="glass"
          className="w-full"
        >
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}
