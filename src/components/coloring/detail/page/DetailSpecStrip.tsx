import { Button } from '@/components/ui/button';

export function DetailSpecStrip({
  items,
}: {
  items: { label: string; value?: string; onClick: () => void; disabled?: boolean }[];
}) {
  return (
    <div className="border-border bg-card/60 grid grid-cols-3 overflow-hidden rounded-lg border">
      {items.map(item => (
        <Button
          key={item.label}
          type="button"
          variant="ghost"
          disabled={item.disabled}
          onClick={item.onClick}
          aria-label={`${item.value || 'Add'} ${item.label}`}
          className="border-border/60 h-auto min-h-16 min-w-0 flex-col gap-0 rounded-none border-l px-2 py-2 first:border-l-0"
        >
          <span
            className={
              item.value
                ? 'max-w-full truncate text-sm font-medium'
                : 'text-primary text-sm font-semibold'
            }
          >
            {item.value || 'Add'}
          </span>
          <span className="text-muted-foreground text-xs font-normal">{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
