import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function FinishDatePrompt({
  status,
  completedAt,
  onToday,
  onPickDate,
  disabled,
}: {
  status: string;
  completedAt: string;
  onToday: () => void;
  onPickDate: () => void;
  disabled?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (status !== 'completed' || completedAt || dismissed) return null;
  return (
    <div className="border-border/60 bg-card space-y-2 rounded-xl border p-3">
      <p className="text-sm font-medium">Did you finish it today?</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="touch" disabled={disabled} onClick={onToday}>
          Yes, today
        </Button>
        <Button
          type="button"
          variant="link"
          className="min-h-11 px-1"
          disabled={disabled}
          onClick={onPickDate}
        >
          Pick a date
        </Button>
        <Button
          type="button"
          variant="link"
          className="min-h-11 px-1"
          disabled={disabled}
          onClick={() => setDismissed(true)}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
