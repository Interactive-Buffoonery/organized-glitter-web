import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePostHog } from '@posthog/react';
import { cn } from '@/lib/utils';
import { AnalyticsEvent } from '@/services/analytics-events';
import { DashboardDisplayedStatusCounts } from '@/hooks/queries/useDashboardStatusCounts';
import { ProjectFilterStatus } from '@/types/project';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import StatusDot from '@/components/shared/StatusDot';
import { FILTER_STATUS_ACTIVE_FILL } from '@/utils/statusColors';

interface DashboardStatusSegmentsProps {
  activeStatus: ProjectFilterStatus;
  displayedCounts: DashboardDisplayedStatusCounts | null;
  isLoadingCounts: boolean;
  hasCountError: boolean;
  onStatusChange: (status: ProjectFilterStatus) => void;
}

const STATUS_SEGMENTS: Array<{ status: ProjectFilterStatus; label: string }> = [
  { status: 'everything', label: 'All' },
  { status: 'wishlist', label: 'Wishlist' },
  { status: 'purchased', label: 'Purchased' },
  { status: 'stash', label: 'In Stash' },
  { status: 'kitted', label: 'Kitted Up' },
  { status: 'progress', label: 'In Progress' },
  { status: 'onhold', label: 'On Hold' },
  { status: 'completed', label: 'Completed' },
  { status: 'archived', label: 'Archived' },
  { status: 'destashed', label: 'Destashed' },
];

const getAccessibleLabel = (label: string, count?: number) => {
  if (typeof count !== 'number') {
    return label;
  }

  return `${label}, ${count} ${count === 1 ? 'kit' : 'kits'}`;
};

const DashboardStatusSegments = ({
  activeStatus,
  displayedCounts,
  isLoadingCounts,
  hasCountError,
  onStatusChange,
}: DashboardStatusSegmentsProps) => {
  const posthog = usePostHog();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const countsAvailable = !isLoadingCounts && !hasCountError && displayedCounts !== null;

  const activeSegment = useMemo(
    () => STATUS_SEGMENTS.find(segment => segment.status === activeStatus) ?? STATUS_SEGMENTS[0],
    [activeStatus]
  );
  const activeCount = countsAvailable ? displayedCounts[activeStatus] : undefined;

  const moveFocus = (nextIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(nextIndex, STATUS_SEGMENTS.length - 1));
    buttonRefs.current[clampedIndex]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(STATUS_SEGMENTS.length - 1);
        break;
      default:
        break;
    }
  };

  const handleStatusChange = (status: ProjectFilterStatus, count?: number) => {
    onStatusChange(status);
    posthog.capture(AnalyticsEvent.DASHBOARD_STATUS_SEGMENT_CLICKED, {
      status,
      count: typeof count === 'number' ? count : null,
    });
  };

  return (
    <section aria-labelledby="dashboard-status-segments-heading">
      <h2 id="dashboard-status-segments-heading" className="sr-only">
        Browse by Status
      </h2>

      {/* ── Below xl: single button + popover listing all statuses ── */}
      <div className="xl:hidden">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'border-border bg-card inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium',
                'hover:bg-muted/50 active:bg-muted transition-colors',
                'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
              )}
              aria-label={`Filter by status. Current: ${getAccessibleLabel(activeSegment.label, activeCount)}`}
              data-testid="status-picker-trigger"
            >
              <span className="flex items-center gap-2">
                <StatusDot status={activeSegment.status} kind="filter" />
                <span className="text-muted-foreground">Status:</span>
                <span>{activeSegment.label}</span>
                {typeof activeCount === 'number' ? (
                  <span className="text-muted-foreground tabular-nums">· {activeCount}</span>
                ) : null}
              </span>
              <ChevronDown aria-hidden="true" className="text-muted-foreground size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(calc(100vw-2rem),20rem)] p-1">
            <ul
              role="listbox"
              aria-label="Filter projects by status"
              className="max-h-80 overflow-y-auto"
            >
              {STATUS_SEGMENTS.map(({ status, label }) => {
                const isActive = activeStatus === status;
                const count = countsAvailable ? displayedCounts[status] : undefined;

                return (
                  <li key={status}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      data-testid={`status-option-${status}`}
                      className={cn(
                        // min-h-11 ~= 44px to meet touch target guidance on phones.
                        'flex min-h-11 w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-sm',
                        'focus:bg-muted active:bg-muted transition-colors focus:outline-none',
                        isActive ? 'bg-muted font-medium' : 'hover:bg-muted/60'
                      )}
                      onClick={() => {
                        handleStatusChange(status, count);
                        setPopoverOpen(false);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <StatusDot status={status} kind="filter" className="flex-shrink-0" />
                        <span className="truncate">{label}</span>
                      </span>
                      {isLoadingCounts ? (
                        <span
                          aria-hidden="true"
                          className="bg-muted inline-block h-4 w-6 flex-shrink-0 animate-pulse rounded"
                        />
                      ) : typeof count === 'number' ? (
                        <span className="text-muted-foreground flex-shrink-0 text-xs tabular-nums">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Desktop (>=xl): single segmented bar, 10 equal segments ── */}
      <div
        className={cn(
          'hidden w-full overflow-hidden rounded-xl p-1 xl:flex',
          'border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))]',
          'shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_1px_3px_rgba(0,0,0,0.06)]',
          'backdrop-blur-xl backdrop-saturate-150'
        )}
        role="group"
        aria-label="Filter projects by status"
      >
        {STATUS_SEGMENTS.map(({ status, label }, index) => {
          const isActive = activeStatus === status;
          const count = countsAvailable ? displayedCounts[status] : undefined;

          return (
            <button
              key={status}
              ref={element => {
                buttonRefs.current[index] = element;
              }}
              type="button"
              className={cn(
                // Fluid flex segments: active tab grows ~2x so its full label fits,
                // inactive tabs shrink and truncate as before.
                // py-2.5 gives ~44px minimum height for touch accessibility (WCAG 2.5.5 / HIG).
                'flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium',
                'transition-[flex-grow,color,background-color] duration-200 ease-out',
                'focus-visible:ring-ring/50 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none',
                isActive ? 'flex-[2_1_0%]' : 'flex-[1_1_0%]',
                isActive
                  ? FILTER_STATUS_ACTIVE_FILL[status]
                  : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--glass-highlight)/0.5)]'
              )}
              aria-pressed={isActive}
              aria-label={getAccessibleLabel(label, count)}
              data-testid={`status-chip-${status}`}
              onClick={() => handleStatusChange(status, count)}
              onKeyDown={event => handleKeyDown(event, index)}
            >
              <span className="truncate">{label}</span>
              {isLoadingCounts ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block h-4 w-5 flex-shrink-0 animate-pulse rounded',
                    isActive ? 'bg-primary-foreground/30' : 'bg-muted'
                  )}
                />
              ) : typeof count === 'number' ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex-shrink-0 text-xs tabular-nums',
                    isActive ? 'opacity-95' : 'opacity-85'
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardStatusSegments;
