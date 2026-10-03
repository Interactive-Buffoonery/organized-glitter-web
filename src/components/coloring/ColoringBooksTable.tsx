import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { getColoringBookStatusColor, getColoringBookStatusLabel } from '@/utils/statusColors';
import type { ColoringSortDirection, ColoringSortField } from '@/contexts/ColoringFilterContext';
import { getColoringBookDetailPath } from '@/pages/coloringBookNavigation';
import type { ColoringBookCardData } from './coloringBookCardTypes';
import ColoringBookListRow from './ColoringBookListRow';
import {
  formatColoringCompletionPercent,
  getColoringActivityLabel,
  getColoringBookFormatLabel,
  getColoringProgressLabel,
  getColoringPublisherLabel,
} from './coloringBookPresentation';

interface ColoringBooksTableProps {
  books: ColoringBookCardData[];
  sortField: ColoringSortField;
  sortDirection: ColoringSortDirection;
  onSort: (sortField: ColoringSortField, sortDirection: ColoringSortDirection) => void;
}

interface ColoringTableColumn {
  id: string;
  label: string;
  className?: string;
  headerClassName?: string;
  sortField?: ColoringSortField;
}

const TABLE_COLUMNS: readonly ColoringTableColumn[] = [
  { id: 'cover', label: 'Cover', className: 'w-16' },
  { id: 'title', label: 'Book', sortField: 'title', className: 'min-w-[16rem]' },
  { id: 'status', label: 'Status', className: 'w-28', headerClassName: 'text-center' },
  { id: 'format', label: 'Format', className: 'w-32' },
  { id: 'publisher', label: 'Publisher', sortField: 'publisher', className: 'w-44' },
  { id: 'completion', label: 'Pages', sortField: 'completion', className: 'w-40' },
  { id: 'activity', label: 'Latest', sortField: 'last_activity', className: 'w-32' },
];

const SortIndicator = ({
  active,
  direction,
}: {
  active: boolean;
  direction: ColoringSortDirection;
}) => {
  if (!active) return <ArrowUpDown className="text-muted-foreground size-4" aria-hidden />;
  if (direction === 'asc') return <ArrowUp className="size-4" aria-hidden />;
  return <ArrowDown className="size-4" aria-hidden />;
};

function ColoringBooksTableComponent({
  books,
  sortField,
  sortDirection,
  onSort,
}: ColoringBooksTableProps) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const renderSortableHeader = (column: ColoringTableColumn) => {
    if (!column.sortField) return <span className="text-sm font-medium">{column.label}</span>;

    const active = sortField === column.sortField;
    const nextDirection: ColoringSortDirection = active && sortDirection === 'asc' ? 'desc' : 'asc';

    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          '-ml-3 h-8 px-3 text-sm font-medium',
          column.headerClassName === 'text-center' && 'mx-auto'
        )}
        onClick={() => onSort(column.sortField!, nextDirection)}
      >
        <span>{column.label}</span>
        <SortIndicator active={active} direction={sortDirection} />
      </Button>
    );
  };

  const stickyHeadClass = 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]';

  return (
    <>
      <div role="list" aria-label="Coloring books" className="space-y-3 lg:hidden">
        {books.map(book => (
          <ColoringBookListRow key={book.id} book={book} />
        ))}
      </div>

      <div className="bg-card hidden overflow-x-auto rounded-xl border lg:block">
        <table className="min-w-[64rem] caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {TABLE_COLUMNS.map(column => (
                <TableHead
                  key={column.id}
                  aria-sort={
                    column.sortField && sortField === column.sortField
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn(stickyHeadClass, column.className, column.headerClassName)}
                >
                  {renderSortableHeader(column)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.map(book => {
              const coverUrl = book.coverImage
                ? ColoringService.getCoverImageUrl(book, '80x120')
                : '';
              return (
                <TableRow key={book.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      to={getColoringBookDetailPath(book.id, returnTo)}
                      state={{ returnTo }}
                      aria-label={`Open coloring book ${book.title}`}
                      className="bg-muted focus-visible:ring-ring block h-12 w-10 overflow-hidden rounded-md focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {coverUrl ? (
                        <PrivateFileImage
                          src={coverUrl}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center">
                          <BookOpen className="text-muted-foreground/60 size-4" aria-hidden />
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={getColoringBookDetailPath(book.id, returnTo)}
                      state={{ returnTo }}
                      className="focus-visible:ring-ring block focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="line-clamp-1 font-medium">{book.title}</span>
                      {book.illustratorName && (
                        <span className="text-muted-foreground mt-0.5 line-clamp-1 block text-xs">
                          Illustrated by {book.illustratorName}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                        getColoringBookStatusColor(book.status)
                      )}
                    >
                      {getColoringBookStatusLabel(book.status)}
                    </span>
                  </TableCell>
                  <TableCell>{getColoringBookFormatLabel(book)}</TableCell>
                  <TableCell>{getColoringPublisherLabel(book)}</TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {getColoringProgressLabel(book)}
                        </span>
                        <span className="tabular-nums">
                          {formatColoringCompletionPercent(book)}
                        </span>
                      </div>
                      <Progress
                        value={book.completionPercentage ?? 0}
                        className="h-1.5"
                        aria-label={`Completion for ${book.title}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {getColoringActivityLabel(book)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
    </>
  );
}

const MemoizedColoringBooksTable = React.memo(ColoringBooksTableComponent);

export default MemoizedColoringBooksTable;
