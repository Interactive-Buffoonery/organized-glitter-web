import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { Tag } from '@/types/tag';
import { cn } from '@/lib/utils';

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  removable?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TagBadge({
  tag,
  onRemove,
  removable = false,
  className,
  size = 'sm',
}: TagBadgeProps) {
  return (
    <Badge
      variant="secondary"
      size={size}
      className={cn(
        'text-foreground cursor-default gap-1 rounded-md text-center font-medium',
        className
      )}
      style={{
        backgroundColor: `${tag.color}20`,
        borderColor: `${tag.color}80`,
      }}
    >
      <span>{tag.name}</span>
      {removable && onRemove && (
        <button
          type="button"
          data-close-button
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 ml-0.5 inline-flex items-center justify-center rounded-sm hover:bg-black/10 dark:hover:bg-white/10"
          aria-label={`Remove ${tag.name} tag`}
        >
          <X className="size-3" />
        </button>
      )}
    </Badge>
  );
}
