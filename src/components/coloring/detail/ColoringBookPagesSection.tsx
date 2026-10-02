import { Loader2 } from 'lucide-react';
import { PageCard } from '@/components/coloring/PageCard';
import { ColoringDetailRefreshNotice } from '@/components/coloring/detail/ColoringDetailRefreshNotice';
import { SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';

interface ColoringBookPagesSectionProps {
  book: ColoringBookDTO;
  pages: ColoringPageDTO[];
  isLoading: boolean;
  error: unknown;
  hasLoadedData: boolean;
  isFetching: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  page: number;
  perPage: number;
  totalItems: number;
  returnTo: string;
  onPageChange: (page: number) => void;
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
  page,
  perPage,
  totalItems,
  returnTo,
  onPageChange,
}: ColoringBookPagesSectionProps) => {
  const failure = error ? ErrorHandler.handleError(error) : null;
  const accessFailed = ErrorHandler.isAccessFailure(failure?.type);
  const showPages = !accessFailed && (!error || hasLoadedData);
  const hasPagination = totalItems > perPage;
  const showPagination = hasPagination && showPages;
  const canReturnToPrevious = !accessFailed && !hasLoadedData && failure?.retryable && page > 1;
  const lastPage = Math.max(1, Math.ceil(totalItems / perPage));
  const rangeStart = (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, totalItems);
  const pageCountLabel = hasPagination
    ? `${rangeStart}-${rangeEnd} of ${totalItems} pages`
    : `${pages.length} pages`;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionHeading>Pages</SectionHeading>
          <p className="text-muted-foreground mt-2 text-sm">
            Track status, photos, notes, and reveals.
          </p>
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

      {showPagination || canReturnToPrevious ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Coloring book pages">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onPageChange(page - 1)}
            disabled={isLoading || page <= 1}
            aria-label={`Previous ${perPage} pages`}
          >
            Previous
          </Button>
          {showPagination && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => onPageChange(page + 1)}
              disabled={isLoading || page >= lastPage}
              aria-label={`Next ${perPage} pages`}
            >
              Next
            </Button>
          )}
        </nav>
      ) : null}

      {!showPages ? null : isLoading ? (
        <div className="flex justify-center py-12" role="status">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
          <span className="sr-only">Loading pages</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10">
          {pages.map(page => (
            <PageCard
              key={page.id}
              bookId={book.id}
              page={page}
              returnTo={returnTo}
              isMysteryBook={book.isMystery}
            />
          ))}
        </div>
      )}
    </section>
  );
};
