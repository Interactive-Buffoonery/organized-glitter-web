import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import type { OverviewFeedItem, OverviewStatusTone } from '@/services/pocketbase/overview.service';

interface OverviewActivityRowProps {
  item: OverviewFeedItem;
}

const STATUS_DOT_CLASS: Record<OverviewStatusTone, string> = {
  progress: 'bg-diamond-500',
  kitted: 'bg-teal-500',
  started: 'bg-diamond-500',
  muted: 'bg-muted-foreground',
};

export function OverviewActivityRow({ item }: OverviewActivityRowProps) {
  return (
    <li className="border-border/60 border-b last:border-b-0">
      <Link
        to={item.href}
        className="group hover:bg-background/35 focus-visible:ring-ring/50 grid gap-3 py-4 transition-colors duration-300 focus-visible:ring-[3px] focus-visible:outline-none @min-[28rem]/activity:grid-cols-[minmax(16rem,1fr)_8rem] @min-[28rem]/activity:items-center @min-[28rem]/activity:gap-4 @min-[28rem]/activity:px-2 @min-[42rem]/activity:grid-cols-[minmax(16rem,1fr)_8rem_9rem] @min-[52rem]/activity:grid-cols-[minmax(16rem,1fr)_8rem_9rem_4rem]"
      >
        <span className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 @min-[28rem]/activity:grid-cols-[4rem_minmax(0,1fr)] @min-[28rem]/activity:gap-4">
          <span className="bg-muted relative block aspect-square overflow-hidden rounded-lg">
            {item.thumbnailUrl ? (
              <PrivateFileImage
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <span className="text-muted-foreground flex size-full items-center justify-center">
                <ImageIcon aria-hidden="true" className="size-5" />
              </span>
            )}
          </span>

          <span className="min-w-0">
            <span className="text-foreground group-hover:text-primary line-clamp-2 text-sm font-semibold wrap-anywhere transition-colors">
              {item.title}
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {item.subtitle}
            </span>
          </span>
        </span>

        <span className="text-foreground flex items-center gap-2 text-sm font-medium @min-[28rem]/activity:justify-start">
          <span
            aria-hidden="true"
            className={cn(
              'block size-2.5 shrink-0 rounded-full',
              STATUS_DOT_CLASS[item.statusTone]
            )}
          />
          {item.statusLabel}
        </span>

        <span className="text-muted-foreground hidden text-sm @min-[42rem]/activity:block">
          {item.activityLabel}
        </span>

        <span className="text-foreground hidden items-center gap-1 text-sm font-semibold @min-[52rem]/activity:flex @min-[52rem]/activity:justify-end">
          Open
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </Link>
    </li>
  );
}
