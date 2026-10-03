import { ColoringBookCard, type ColoringBookCardData } from './ColoringBookCard';
import { ColoringEmptyState } from './ColoringEmptyState';
import ColoringBookListRow from './ColoringBookListRow';
import ColoringBooksTable from './ColoringBooksTable';
import type {
  ColoringSortDirection,
  ColoringSortField,
  ColoringViewType,
} from '@/contexts/ColoringFilterContext';

interface ColoringBookGridProps {
  books: ColoringBookCardData[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
  viewType?: ColoringViewType;
  sortField?: ColoringSortField;
  sortDirection?: ColoringSortDirection;
  onSort?: (sortField: ColoringSortField, sortDirection: ColoringSortDirection) => void;
}

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {SKELETON_KEYS.map(k => (
        <div key={k} className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="bg-muted/30 border-border/50 aspect-[3/4] w-full animate-pulse border-b" />
          <div className="space-y-3 p-4">
            <div className="bg-muted/40 h-4 w-3/4 animate-pulse rounded" />
            <div className="bg-muted/30 h-3 w-1/2 animate-pulse rounded" />
            <div className="bg-muted/30 h-1 w-full animate-pulse rounded-full" />
            <div className="flex justify-end">
              <div className="bg-muted/40 h-5 w-16 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="space-y-3">
      {SKELETON_KEYS.slice(0, 6).map(k => (
        <div
          key={k}
          className="border-border bg-card flex animate-pulse overflow-hidden rounded-xl border shadow-sm"
        >
          <div className="bg-muted/30 h-28 w-20 shrink-0 sm:h-32 sm:w-24" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 p-3 sm:p-4">
            <div className="space-y-2">
              <div className="bg-muted/40 h-4 w-3/4 rounded" />
              <div className="bg-muted/30 h-3 w-1/2 rounded" />
            </div>
            <div className="bg-muted/30 h-1.5 w-full rounded-full" />
            <div className="flex justify-between">
              <div className="bg-muted/30 h-3 w-32 rounded" />
              <div className="bg-muted/40 h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ColoringBookGrid({
  books,
  isLoading,
  hasActiveFilters,
  onClearFilters,
  viewType = 'grid',
  sortField = 'date_added',
  sortDirection = 'desc',
  onSort,
}: ColoringBookGridProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading coloring books</span>
        {viewType === 'grid' ? <GridSkeleton /> : <RowSkeleton />}
      </div>
    );
  }

  if (books.length === 0) {
    return <ColoringEmptyState hasFilters={hasActiveFilters} onClearFilters={onClearFilters} />;
  }

  if (viewType === 'table') {
    return (
      <ColoringBooksTable
        books={books}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={onSort ?? (() => undefined)}
      />
    );
  }

  if (viewType === 'list') {
    return (
      <div role="list" aria-label="Coloring books" className="space-y-4">
        {books.map(book => (
          <ColoringBookListRow key={book.id} book={book} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {books.map(book => (
        <ColoringBookCard key={book.id} book={book} />
      ))}
    </div>
  );
}
