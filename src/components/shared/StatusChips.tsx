import { cn } from '@/lib/utils';

type StatusOption<T extends string> = { value: T; label: string; count?: number };
export function StatusChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | T[];
  options: StatusOption<T>[];
  onChange: (value: T) => void;
}) {
  const isSelected = (option: StatusOption<T>) =>
    Array.isArray(value) ? value.includes(option.value) : value === option.value;
  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="flex min-w-0 gap-2 overflow-x-auto pb-2"
    >
      {options
        .filter((option, index) => index === 0 || option.count !== 0 || isSelected(option))
        .map(option => (
          <button
            type="button"
            key={option.value}
            aria-pressed={isSelected(option)}
            aria-label={`${option.label}${option.count === undefined ? '' : ` ${option.count}`}`}
            onClick={() => onChange(option.value)}
            className={cn(
              'border-border text-muted-foreground focus-visible:ring-ring min-h-11 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap focus-visible:ring-2',
              isSelected(option) && 'bg-foreground text-background border-foreground font-semibold'
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="ml-2 tabular-nums opacity-75"> {option.count}</span>
            )}
          </button>
        ))}
    </div>
  );
}
