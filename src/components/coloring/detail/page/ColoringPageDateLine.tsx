import { Button } from '@/components/ui/button';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';

export function ColoringPageDateLine({
  startedAt,
  completedAt,
  revealedAt,
  userTimezone,
  onEdit,
}: {
  startedAt: string;
  completedAt: string;
  revealedAt?: string;
  userTimezone: string;
  onEdit: (field: 'startedAt' | 'completedAt') => void;
}) {
  const dates = [
    { field: 'startedAt' as const, label: 'Started', value: startedAt },
    { field: null, label: 'Revealed', value: revealedAt },
    { field: 'completedAt' as const, label: 'Finished', value: completedAt },
  ].filter(date => date.value);
  const missing = !startedAt ? 'startedAt' : !completedAt ? 'completedAt' : null;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
      {dates.map((date, index) => (
        <span key={date.label} className="inline-flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">·</span>}
          {date.field ? (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-1 text-sm text-current"
              onClick={() => onEdit(date.field!)}
            >
              {date.label}{' '}
              {formatDateInUserTimezone(date.value!, userTimezone, 'EEE, MMM d').replace(
                /^[^,]+, /,
                ''
              )}
            </Button>
          ) : (
            <span>
              {date.label}{' '}
              {formatDateInUserTimezone(date.value!, userTimezone, 'EEE, MMM d').replace(
                /^[^,]+, /,
                ''
              )}
            </span>
          )}
        </span>
      ))}
      {missing && (
        <>
          {dates.length > 0 && <span aria-hidden="true">·</span>}
          <Button
            type="button"
            variant="link"
            className="min-h-11 px-1 text-sm"
            onClick={() => onEdit(missing)}
          >
            add {missing === 'startedAt' ? 'start' : 'finish'} date
          </Button>
        </>
      )}
    </div>
  );
}
