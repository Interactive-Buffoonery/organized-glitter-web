import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SpecStripItem {
  key: string;
  label: string;
  value?: string;
  onEdit: () => void;
  disabled?: boolean;
}

export function SpecStrip({ items }: { items: SpecStripItem[] }) {
  return (
    <div className="border-border bg-card/60 grid grid-cols-4 overflow-hidden rounded-xl border">
      {items.map(item => (
        <Button
          key={item.key}
          type="button"
          variant="ghost"
          disabled={item.disabled}
          onClick={item.onEdit}
          className="border-border/60 h-auto min-h-16 min-w-0 flex-col gap-1 rounded-none border-l px-1 py-3 first:border-l-0"
        >
          {item.value && <span className="sr-only">Edit</span>}{' '}
          <span
            className={cn(
              'max-w-full text-sm break-words whitespace-normal',
              item.value ? 'text-foreground font-mono font-normal' : 'text-primary font-semibold'
            )}
          >
            {item.value || 'Add'}
          </span>{' '}
          <span className="text-muted-foreground text-xs font-normal">{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
