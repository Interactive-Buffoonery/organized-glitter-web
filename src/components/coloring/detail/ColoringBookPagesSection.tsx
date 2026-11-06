import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ContactSheetCell } from '@/components/coloring/ContactSheetCell';
import { ColoringDetailRefreshNotice } from '@/components/coloring/detail/ColoringDetailRefreshNotice';
import { SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { countUnit } from '@/utils/countUnit';

interface ColoringBookPagesSectionProps {
  book: ColoringBookDTO;
  pages: ColoringPageDTO[];
  isLoading: boolean;
  error: unknown;
  hasLoadedData: boolean;
  isFetching: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  latestPhotos?: Record<string, string>;
  returnTo: string;
}

export const ColoringBookPagesSection = ({
  book,
  pages,
  isLoading,
  error,
  hasLoadedData,
  isFetching,
  isRetrying,
  onRetry,
  latestPhotos = {},
  returnTo,
}: ColoringBookPagesSectionProps) => {
  const failure = error ? ErrorHandler.handleError(error) : null;
  const accessFailed = ErrorHandler.isAccessFailure(failure?.type);
  const showPages = !accessFailed && (!error || hasLoadedData);
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState(false);
  const filters = ['All', 'In progress', 'Done', 'Not started'];
  const matches = (page: ColoringPageDTO, selected: string) =>
    selected === 'All' ||
    (selected === 'Done'
      ? page.status === 'completed'
      : selected === 'Not started'
        ? page.status === 'not_started'
        : page.status !== 'completed' && page.status !== 'not_started');
  const filtered = pages.filter(page => matches(page, filter));
  const displayed = filter === 'All' && !expanded ? filtered.slice(0, 18) : filtered;
  const pageCountLabel = `${pages.length} ${countUnit(pages.length, 'page')}`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <SectionHeading>Pages</SectionHeading>
        </div>
        {showPages && (
          <p
            className="text-muted-foreground text-sm tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {pageCountLabel}
          </p>
        )}
      </div>

      {Boolean(error) && (
        <ColoringDetailRefreshNotice
          kind="book"
          message={
            failure?.type === 'auth'
              ? 'Sign in to view coloring book pages.'
              : failure?.type === 'permission'
                ? 'You cannot view coloring book pages.'
                : failure?.type === 'not_found'
                  ? 'Coloring book pages not found.'
                  : hasLoadedData
                    ? 'Could not refresh coloring book pages. Showing the last loaded pages.'
                    : 'Could not load coloring book pages.'
          }
          retryable={failure?.retryable ?? false}
          onRetry={onRetry}
          isRetrying={isFetching || isRetrying}
        />
      )}

      {showPages && !isLoading && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter pages">
          {filters.map(label => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
              className={
                filter === label
                  ? 'bg-foreground text-background hover:bg-foreground hover:text-background min-h-11 shrink-0 rounded-full border px-3 text-xs'
                  : 'border-border text-muted-foreground min-h-11 shrink-0 rounded-full border px-3 text-xs'
              }
            >
              {label} {pages.filter(page => matches(page, label)).length}
            </Button>
          ))}
        </div>
      )}

      {!showPages ? null : isLoading ? (
        <div className="flex justify-center py-12" role="status">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
          <span className="sr-only">Loading pages</span>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-6 lg:gap-2.5">
          {displayed.map(page => (
            <ContactSheetCell
              key={page.id}
              bookId={book.id}
              page={page}
              latestPhoto={latestPhotos[page.id]}
              returnTo={returnTo}
              isMysteryBook={book.isMystery}
            />
          ))}
        </div>
      )}
      {showPages && !isLoading && filter === 'All' && !expanded && pages.length > 18 && (
        <Button
          type="button"
          variant="link"
          className="text-foreground decoration-primary/50 min-h-11 px-0 underline decoration-2 underline-offset-4"
          onClick={() => setExpanded(true)}
        >
          Show all {pages.length} pages
        </Button>
      )}
      {showPages && !isLoading && filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">No pages here yet.</p>
      )}
    </section>
  );
};
