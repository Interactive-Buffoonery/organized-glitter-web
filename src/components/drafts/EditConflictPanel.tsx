import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';

interface EditConflictPanelProps {
  itemName: string;
  detailPath: string;
  onUseLatest: () => Promise<boolean>;
  focusOnMount?: boolean;
}

export function EditConflictPanel({
  itemName,
  detailPath,
  onUseLatest,
  focusOnMount = false,
}: EditConflictPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!focusOnMount) {
      panel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      return;
    }

    const scrollToFocusedPanel = () => {
      panel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    };
    panel.addEventListener('focus', scrollToFocusedPanel, { once: true });
    const stopWaitingForFocus = focusWhenRootInteractive(panel);
    return () => {
      stopWaitingForFocus();
      panel.removeEventListener('focus', scrollToFocusedPanel);
    };
  }, [focusOnMount]);

  return (
    <section
      ref={panelRef}
      role="alert"
      tabIndex={focusOnMount ? -1 : undefined}
      className="border-border bg-card focus-visible:ring-ring mb-5 space-y-3 rounded-lg border p-4 focus-visible:ring-2"
    >
      <p className="text-foreground text-sm font-medium">This {itemName} changed elsewhere.</p>
      <p className="text-muted-foreground text-sm">
        Your edits are still here. Review the latest version before saving again. Keeping your edits
        will replace newer details in this form.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="glass"
          className="min-h-11"
          onClick={() => window.open(detailPath, '_blank', 'noopener,noreferrer')}
        >
          Review latest
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void onUseLatest()}
        >
          Keep my edits for a new save
        </Button>
      </div>
    </section>
  );
}
