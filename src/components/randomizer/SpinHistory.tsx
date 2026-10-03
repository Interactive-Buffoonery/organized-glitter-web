/**
 * @fileoverview Spin History Display Component
 *
 * Displays a chronological list of randomizer wheel spin results with pagination,
 * navigation to selected projects, and history management features. Includes
 * responsive design and comprehensive error handling.
 *
 * @author serabi
 * @version 1.0.0
 * @since 2025-06-28
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, History, Trash2, ChevronDown } from 'lucide-react';
import { useSpinHistory } from '@/hooks/queries/useSpinHistory';
import { useSpinHistoryCount } from '@/hooks/queries/useSpinHistoryCount';
import { RANDOMIZER_MODE_LABELS, RANDOMIZER_TARGET_TYPE_LABELS } from '@/types/randomizer';
import { createLogger } from '@/utils/logger';
import type {
  RandomizerMode,
  RandomizerSpinMetadata,
  RandomizerTargetType,
} from '@/types/randomizer';

const logger = createLogger('SpinHistory');

function getSpinMetadataTarget(metadata: RandomizerSpinMetadata | null | undefined) {
  if (!metadata?.target) return null;
  return metadata.target;
}

const HISTORY_MODE_FILTERS: Array<{ value: 'all' | RandomizerMode; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'diamond', label: 'Diamonds' },
  { value: 'coloring-book', label: 'Books' },
  { value: 'coloring-page', label: 'Pages' },
];

function modeFromTargetType(targetType: RandomizerTargetType | undefined): RandomizerMode {
  if (targetType === 'coloring_book') return 'coloring-book';
  if (targetType === 'coloring_page') return 'coloring-page';
  return 'diamond';
}

function getSpinMode(metadata: RandomizerSpinMetadata | null | undefined): RandomizerMode {
  if (
    metadata?.mode === 'diamond' ||
    metadata?.mode === 'coloring-book' ||
    metadata?.mode === 'coloring-page'
  ) {
    return metadata.mode;
  }

  return modeFromTargetType(metadata?.target?.targetType);
}

/**
 * Props interface for the SpinHistory component
 * @interface SpinHistoryProps
 */
interface SpinHistoryProps {
  /** User ID to fetch spin history for */
  userId: string | undefined;
  /** Whether diamond painting history is visible for this user */
  canUseDiamond: boolean;
  /** Whether coloring history is visible for this user */
  canUseColoring: boolean;
  /** Optional callback function to clear all history */
  onClearHistory?: () => void;
  /** Render the history list inline instead of inside a scroll area */
  disableScrollArea?: boolean;
  /** Hide the internal heading when the parent surface already labels the region */
  hideHeader?: boolean;
}

/**
 * Displays chronological spin history with pagination and management features
 *
 * Shows a scrollable list of past randomizer wheel spins with relative timestamps,
 * project navigation links, and optional history clearing. Uses dynamic pagination
 * to show 8 recent spins by default with option to load up to 50 total spins.
 *
 * @param {SpinHistoryProps} props - Component props
 * @param {string|undefined} props.userId - User ID to fetch history for
 * @param {function} [props.onClearHistory] - Optional callback to clear all history
 *
 * @returns {JSX.Element} The rendered spin history component
 *
 * @example
 * ```tsx
 * <SpinHistory userId={user?.id} />
 * ```
 *
 * @features
 * - Chronological display with newest spins first
 * - Relative timestamps (e.g., "2h ago", "3d ago")
 * - Project navigation links with external link icons
 * - Pagination: 8 recent → expand to 50 total
 * - Loading skeletons during data fetch
 * - Empty state with helpful messaging
 * - History clearing with confirmation
 * - Responsive scrollable design
 * - Latest spin badge highlighting
 *
 * @performance
 * - Single React Query hook with dynamic limit
 * - Efficient re-rendering with optimized state management
 * - Minimal network requests through pagination strategy
 */
export const SpinHistory: React.FC<SpinHistoryProps> = ({
  userId,
  canUseDiamond,
  canUseColoring,
  onClearHistory,
  disableScrollArea = false,
  hideHeader = false,
}) => {
  /** Whether to show all history (50 items) or just recent (8 items) */
  const [showAll, setShowAll] = useState(false);
  const [modeFilter, setModeFilter] = useState<'all' | RandomizerMode>('all');

  /** Dynamic limit based on pagination state - 8 recent or 50 total */
  const dynamicLimit = showAll ? 50 : 8;

  /** Spin history data with loading state from React Query */
  const { data: history = [], isLoading } = useSpinHistory({
    userId,
    limit: dynamicLimit,
    enabled: true,
  });
  const { data: totalHistoryCount = 0 } = useSpinHistoryCount({
    userId,
    enabled: true,
  });
  const isModeVisible = (mode: RandomizerMode) => {
    if (mode === 'diamond') return canUseDiamond;
    return canUseColoring;
  };
  const activeModeFilter = modeFilter !== 'all' && !isModeVisible(modeFilter) ? 'all' : modeFilter;
  const visibleModeFilters = HISTORY_MODE_FILTERS.filter(filter => {
    if (filter.value === 'all') return canUseDiamond && canUseColoring;
    return isModeVisible(filter.value);
  });
  const visibleHistory = history.filter(spin => isModeVisible(getSpinMode(spin.metadata)));

  /** Whether there are more history items to show beyond the current 8 */
  const hasMoreHistory = !showAll && totalHistoryCount > history.length;
  const filteredHistory =
    activeModeFilter === 'all'
      ? visibleHistory
      : visibleHistory.filter(spin => getSpinMode(spin.metadata) === activeModeFilter);

  // Debug logging - summary information only (no sensitive data)
  React.useEffect(() => {
    if (history.length > 0) {
      logger.debug('Spin history data summary', {
        showAll,
        dynamicLimit,
        historyLength: history.length,
        hasRecords: history.length > 0,
      });
    }
  }, [history, showAll, dynamicLimit]);

  /**
   * Handles the "Show More" button click to expand history to 50 items
   * Updates the showAll state which triggers a new query with higher limit
   */
  const handleShowMore = () => {
    logger.debug('Show more history clicked');
    setShowAll(true);
    // Data should already be prefetched, so this will be instant
  };

  /**
   * Formats a date string into a human-readable relative time
   *
   * @param {string} dateString - ISO date string to format
   * @returns {string} Formatted relative time (e.g., "2h ago", "3d ago")
   */
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);

      // Check if the date is invalid
      if (isNaN(date.getTime())) {
        logger.error('Invalid date string', { dateString });
        return 'Unknown';
      }

      const now = new Date();
      const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 1) {
        const diffInMinutes = Math.floor(diffInHours * 60);
        return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes}m ago`;
      } else if (diffInHours < 24) {
        return `${Math.floor(diffInHours)}h ago`;
      } else if (diffInHours < 168) {
        // 7 days
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
      } else {
        return date.toLocaleDateString();
      }
    } catch (error) {
      logger.error('Error formatting date', { dateString, error });
      return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {!hideHeader && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Spin History</h3>
          </div>
        )}
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border-border/60 space-y-2 border-t py-3"
              data-testid="spin-skeleton"
            >
              <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
              <div className="bg-muted/70 h-3 w-1/2 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const historyList = (
    <div className="border-border/60 divide-border/60 divide-y border-y pr-4">
      {filteredHistory.map((spin, index) => {
        const metadata = spin.metadata;
        const metadataTarget = getSpinMetadataTarget(metadata);
        const spinMode = getSpinMode(metadata);
        const targetTitle = metadataTarget?.title || spin.project_title;
        const targetSubtitle =
          metadataTarget?.subtitle ||
          [spin.project_company, spin.project_artist].filter(Boolean).join(' • ');
        const targetHref =
          metadataTarget?.href || (spin.project ? `/projects/${spin.project}` : '');
        const typeLabel = metadataTarget?.targetType
          ? RANDOMIZER_TARGET_TYPE_LABELS[metadataTarget.targetType]
          : 'Diamond painting';
        const optionCount =
          metadata?.selectedTargetIds?.length ?? (spin.selected_projects as string[])?.length ?? 0;

        return (
          <div
            key={spin.id}
            className="hover:bg-secondary/60 dark:hover:bg-accent/20 py-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate font-medium">{targetTitle}</p>
                  <Badge variant="outline" className="text-xs">
                    {typeLabel}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {RANDOMIZER_MODE_LABELS[spinMode]}
                  </Badge>
                  {index === 0 && (
                    <Badge variant="secondary" className="text-xs">
                      Latest
                    </Badge>
                  )}
                </div>
                {targetSubtitle && (
                  <p className="text-muted-foreground mb-1 truncate text-sm">{targetSubtitle}</p>
                )}
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span>{formatDate(spin.spun_at)}</span>
                  <span>•</span>
                  <span>{optionCount} options</span>
                </div>
              </div>

              {targetHref && (
                <div className="flex-shrink-0">
                  <Button type="button" variant="ghost" size="sm" asChild className="h-auto p-1">
                    <Link
                      to={targetHref}
                      onClick={() => {
                        logger.debug('Target link clicked from history', {
                          targetHref,
                          targetTitle,
                        });
                      }}
                      aria-label={`Go to ${targetTitle}`}
                    >
                      <ExternalLink className="size-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {(!hideHeader || (history.length > 0 && onClearHistory)) && (
        <div className="flex items-center justify-between">
          {!hideHeader && <h3 className="text-lg font-semibold">Spin History</h3>}
          {history.length > 0 && onClearHistory && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                logger.debug('Clear history button clicked');
                onClearHistory();
              }}
              className="text-destructive-text hover:text-destructive-text"
              aria-label="Clear spin history"
            >
              <Trash2 className="mr-1 size-4" />
              Clear
            </Button>
          )}
        </div>
      )}

      {visibleHistory.length > 0 && visibleModeFilters.length > 1 && (
        <div role="group" className="flex flex-wrap gap-2" aria-label="Filter spin history by mode">
          {visibleModeFilters.map(filter => (
            <Button
              key={filter.value}
              type="button"
              variant={activeModeFilter === filter.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setModeFilter(filter.value)}
              aria-pressed={activeModeFilter === filter.value}
              className="h-8 rounded-full px-3 text-xs"
            >
              {filter.label}
            </Button>
          ))}
        </div>
      )}

      {/* History list */}
      {visibleHistory.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center">
          <History className="mx-auto mb-3 size-12 opacity-50" />
          <p className="mb-1 text-base">No spins yet</p>
          <p className="text-sm">Your spin history will appear here</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-muted-foreground border-border/60 border-y py-6 text-center text-sm">
          {!showAll && hasMoreHistory
            ? 'No spins for this mode in recent history. Show more to check older spins.'
            : 'No spins for this mode yet.'}
        </div>
      ) : disableScrollArea ? (
        historyList
      ) : (
        <ScrollArea className="min-h-0 flex-1">{historyList}</ScrollArea>
      )}

      {/* Show More Button */}
      {hasMoreHistory && (
        <div className="border-t pt-3 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleShowMore}
            disabled={isLoading}
            className="text-sm"
          >
            <ChevronDown className="mr-1 size-4" />
            {isLoading ? 'Loading…' : 'Show More History'}
          </Button>
        </div>
      )}

      {/* Footer note */}
      {history.length > 0 && (
        <p className="text-muted-foreground mt-2 text-center text-xs">
          {showAll
            ? `Showing all ${history.length} spins`
            : `Showing last ${Math.min(history.length, 8)} spins`}
        </p>
      )}
    </div>
  );
};
