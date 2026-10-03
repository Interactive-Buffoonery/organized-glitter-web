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

const getActionLabel = (kind: OverviewFeedItem['kind']) => {
  if (kind === 'coloring-page') return 'Open page';
  return 'Open';
};

export function OverviewActivityRow({ item }: OverviewActivityRowProps) {
  const actionLabel = getActionLabel(item.kind);

  return (
    <li className="border-border/60 border-b last:border-b-0">
      <Link
        to={item.href}
        aria-label={`Open ${item.title}`}
        className="group hover:bg-background/35 focus-visible:ring-ring/50 grid gap-3 py-4 transition-colors duration-300 focus-visible:ring-[3px] focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_11rem_11rem_8rem] sm:items-center sm:gap-4 sm:px-2"
      >
        <span className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-4">
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
            <span className="text-foreground group-hover:text-primary block truncate text-sm font-semibold transition-colors">
              {item.title}
            </span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {item.subtitle}
            </span>
          </span>
        </span>

        <span className="text-foreground flex items-center gap-2 text-sm font-medium sm:justify-start">
          <span
            aria-hidden="true"
            className={cn('block size-2.5 rounded-full', STATUS_DOT_CLASS[item.statusTone])}
          />
          {item.statusLabel}
        </span>

        <span className="text-muted-foreground text-sm">{item.activityLabel}</span>

        <span className="text-foreground flex items-center gap-1 text-sm font-semibold sm:justify-end">
          {actionLabel}
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </Link>
    </li>
  );
}
