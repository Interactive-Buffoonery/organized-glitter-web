import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';

interface DraftRecoveryPanelProps {
  changedOnServer?: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}

function focusAfterDraftChoice(parent: HTMLElement | null, preferReminder: boolean) {
  window.setTimeout(() => {
    const reminder = preferReminder
      ? parent?.querySelector<HTMLElement>('[data-draft-photo-reminder]')
      : null;
    const firstField = parent?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    focusWhenRootInteractive(reminder ?? firstField ?? null);
  }, 0);
}

export function DraftRecoveryPanel({
  changedOnServer,
  onRestore,
  onDiscard,
}: DraftRecoveryPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const resolve = (action: () => void, preferReminder: boolean) => {
    const parent = panelRef.current?.parentElement;
    action();
    focusAfterDraftChoice(parent ?? null, preferReminder);
  };

  return (
    <section
      ref={panelRef}
      aria-label="Unfinished draft"
      className="border-border bg-card mb-5 space-y-3 rounded-lg border p-4"
    >
      <p className="text-foreground text-sm font-medium">
        You have an unfinished draft saved on this device.
      </p>
      {changedOnServer ? (
        <p className="text-destructive-text text-sm">
          This item changed since the draft was saved. Restoring it may replace newer details.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Drafts on this device are kept for up to 30 days and are removed when you sign out.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="glass"
          className="min-h-11"
          onClick={() => resolve(onRestore, true)}
        >
          Restore draft
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => resolve(onDiscard, false)}
        >
          Discard draft
        </Button>
      </div>
    </section>
  );
}

export function DraftStorageError() {
  return (
    <p role="status" className="text-destructive-text mb-4 text-sm">
      Could not save a draft on this device. Keep this page open until you save.
    </p>
  );
}

interface DraftPhotoReminderProps {
  onContinue: () => void;
}

export function DraftPhotoReminder({ onContinue }: DraftPhotoReminderProps) {
  const reminderRef = useRef<HTMLElement>(null);
  return (
    <section
      ref={reminderRef}
      data-draft-photo-reminder
      role="status"
      tabIndex={-1}
      className="border-border bg-card mb-5 space-y-2 rounded-lg border p-4"
    >
      <p className="text-foreground text-sm">Select your photo again before saving.</p>
      <p className="text-muted-foreground text-xs">
        The photo file was not saved in this draft. Any photo already saved to your account is still
        there.
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => {
          const parent = reminderRef.current?.parentElement;
          onContinue();
          focusAfterDraftChoice(parent ?? null, false);
        }}
      >
        Continue without new photo
      </Button>
    </section>
  );
}
