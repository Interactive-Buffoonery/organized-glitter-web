import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        className
      )}
    >
      <Circle className="size-2 fill-current" aria-hidden="true" />
      {label}
    </span>
  );
}
