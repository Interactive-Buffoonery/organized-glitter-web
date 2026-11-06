import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { OverviewFeedItem } from '@/services/pocketbase/overview.service';

interface OverviewActivityRowProps {
  item: OverviewFeedItem;
}

export function OverviewActivityRow({ item }: OverviewActivityRowProps) {
  return (
    <li className="border-border/60 border-b last:border-b-0">
      <Link
        to={item.href}
        className="group hover:bg-background/35 focus-visible:ring-ring/50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none @min-[36rem]/activity:grid-cols-[minmax(0,1fr)_11rem_auto]"
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

        <span className="text-muted-foreground col-start-1 row-start-2 pl-[4.25rem] text-xs @min-[36rem]/activity:col-start-2 @min-[36rem]/activity:row-start-1 @min-[36rem]/activity:pl-0 @min-[36rem]/activity:text-sm">
          {item.activityLabel}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground col-start-2 row-start-1 size-4 @min-[36rem]/activity:col-start-3"
        />
      </Link>
    </li>
  );
}
