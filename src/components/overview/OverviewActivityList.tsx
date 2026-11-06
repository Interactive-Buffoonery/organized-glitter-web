import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OverviewActivityRow } from './OverviewActivityRow';
import type { OverviewCraftFilter, OverviewFeedItem } from '@/services/pocketbase/overview.service';

interface OverviewActivityListProps {
  items: OverviewFeedItem[];
  activeCraftFilter: OverviewCraftFilter;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const EMPTY_COPY: Record<OverviewCraftFilter, string> = {
  all: 'Nothing is in progress right now.',
  diamond: 'No diamond paintings are active right now.',
  coloring: 'No coloring pages in progress right now.',
};

export function OverviewActivityList({
  items,
  activeCraftFilter,
  isLoading,
  isError,
  onRetry,
}: OverviewActivityListProps) {
  if (isLoading) {
    return (
      <div className="border-border/60 border-y" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading overview activity</span>
        {[1, 2, 3, 4].map(index => (
          <div key={index} className="border-border/60 grid gap-3 border-b py-4 last:border-b-0">
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-border/60 space-y-4 border-y py-10 text-center">
        <div className="space-y-2">
          <h3 className="text-foreground text-lg font-semibold">Unable to load Overview</h3>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            There was a problem loading your active projects. Please try again.
          </p>
        </div>
        <Button type="button" variant="glass" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-border/60 border-y py-10 text-center">
        <p className="text-muted-foreground">{EMPTY_COPY[activeCraftFilter]}</p>
      </div>
    );
  }

  return (
    <div className="@container/activity">
      <div className="text-muted-foreground border-border/60 hidden grid-cols-[minmax(16rem,1fr)_8rem] gap-4 border-b px-2 pb-3 text-xs font-semibold tracking-tight @min-[28rem]/activity:grid @min-[42rem]/activity:grid-cols-[minmax(16rem,1fr)_8rem_9rem] @min-[52rem]/activity:grid-cols-[minmax(16rem,1fr)_8rem_9rem_4rem]">
        <span>Project</span>
        <span>Status</span>
        <span className="hidden @min-[42rem]/activity:block">Activity</span>
        <span className="sr-only">Action</span>
      </div>
      <ul className="border-border/60 border-b">
        {items.map(item => (
          <OverviewActivityRow key={item.key} item={item} />
        ))}
      </ul>
    </div>
  );
}
