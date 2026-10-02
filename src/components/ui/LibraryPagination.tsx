import React, { useCallback, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { LIBRARY_PAGE_SIZES } from '@/constants/pagination';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LibraryPaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  getPageHref?: (page: number) => string;
  itemLabel: string;
  itemsLabel: string;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

const LibraryPagination: React.FC<LibraryPaginationProps> = React.memo(
  ({
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    getPageHref,
    itemLabel,
    itemsLabel,
    className,
    disabled = false,
    isLoading = false,
  }) => {
    const isMobile = useIsMobile();
    const controlsDisabled = disabled || isLoading;

    const getPageNavigationProps = useCallback(
      (page: number, permanentlyDisabled = disabled) => {
        const interactionBlocked = permanentlyDisabled || isLoading;
        if (!getPageHref) {
          return {
            disabled: permanentlyDisabled,
            'aria-disabled': interactionBlocked || undefined,
            onClick: () => !interactionBlocked && onPageChange(page),
          };
        }

        return {
          href: getPageHref(page),
          'aria-disabled': interactionBlocked || undefined,
          tabIndex: permanentlyDisabled ? -1 : undefined,
          onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (interactionBlocked) {
              event.preventDefault();
              return;
            }
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            onPageChange(page);
          },
        };
      },
      [disabled, getPageHref, isLoading, onPageChange]
    );

    // Memoize calculations to prevent unnecessary re-computations
    const { startItem, endItem } = useMemo(
      () => ({
        startItem: (currentPage - 1) * pageSize + 1,
        endItem: Math.min(currentPage * pageSize, totalItems),
      }),
      [currentPage, pageSize, totalItems]
    );

    const renderPageNumbers = useMemo(() => {
      const pages = [];
      // Reduce visible pages on mobile for better fit
      const maxVisiblePages = isMobile ? 3 : 5;

      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

      // Adjust startPage if we're near the end
      if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }

      // First page and ellipsis
      if (startPage > 1) {
        pages.push(
          <PaginationItem key={1}>
            <PaginationLink
              {...getPageNavigationProps(1)}
              isActive={currentPage === 1}
              className={cn(
                'pointer-coarse:min-w-11',
                controlsDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              )}
            >
              1
            </PaginationLink>
          </PaginationItem>
        );
        if (startPage > 2) {
          pages.push(
            <PaginationItem key="ellipsis-start">
              <PaginationEllipsis />
            </PaginationItem>
          );
        }
      }

      // Visible page numbers
      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
        pages.push(
          <PaginationItem key={pageNumber}>
            <PaginationLink
              {...getPageNavigationProps(pageNumber)}
              isActive={currentPage === pageNumber}
              className={cn(
                'pointer-coarse:min-w-11',
                controlsDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              )}
            >
              {pageNumber}
            </PaginationLink>
          </PaginationItem>
        );
      }

      // Last page and ellipsis
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          pages.push(
            <PaginationItem key="ellipsis-end">
              <PaginationEllipsis />
            </PaginationItem>
          );
        }
        pages.push(
          <PaginationItem key={totalPages}>
            <PaginationLink
              {...getPageNavigationProps(totalPages)}
              isActive={currentPage === totalPages}
              className={cn(
                'pointer-coarse:min-w-11',
                controlsDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              )}
            >
              {totalPages}
            </PaginationLink>
          </PaginationItem>
        );
      }

      return pages;
    }, [currentPage, totalPages, isMobile, controlsDisabled, getPageNavigationProps]);

    if (totalPages <= 1) {
      return (
        <div
          className={cn(
            'flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0',
            className
          )}
        >
          {/* Status text - showing total items */}
          <div
            className="text-muted-foreground text-center text-sm sm:text-left"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {isLoading
              ? `Loading page ${currentPage}`
              : `Showing ${totalItems} ${totalItems === 1 ? itemLabel : itemsLabel}`}
          </div>

          {/* Page size selector - still useful for single page */}
          <div className="flex items-center justify-center gap-x-2 sm:justify-start">
            <span className="text-muted-foreground text-sm whitespace-nowrap">
              <span className="sm:hidden">Per page</span>
              <span className="hidden sm:inline">Items per page:</span>
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={value => onPageSizeChange(parseInt(value))}
              disabled={disabled}
            >
              <SelectTrigger className="w-[4.5rem] sm:w-20" aria-label="Items per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIBRARY_PAGE_SIZES.map(size => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0',
          className
        )}
      >
        {/* Status text - full width on mobile, left side on desktop */}
        <div
          className="text-muted-foreground text-center text-sm sm:text-left"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {isLoading
            ? `Loading page ${currentPage}`
            : `Showing ${startItem}-${endItem} of ${totalItems} ${itemsLabel}`}
        </div>

        {/* Controls container - stacked on mobile, row on desktop */}
        <div className="flex flex-col gap-y-3 sm:flex-row sm:items-center sm:gap-x-4 sm:gap-y-0">
          {/* Page size selector */}
          <div className="flex items-center justify-center gap-x-2 sm:justify-start">
            <span className="text-muted-foreground text-sm whitespace-nowrap">
              <span className="sm:hidden">Per page</span>
              <span className="hidden sm:inline">Items per page:</span>
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={value => onPageSizeChange(parseInt(value))}
              disabled={disabled}
            >
              <SelectTrigger className="w-[4.5rem] sm:w-20" aria-label="Items per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIBRARY_PAGE_SIZES.map(size => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pagination controls */}
          <div className="flex justify-center sm:justify-end">
            <Pagination aria-label={`${itemsLabel} pagination`} aria-busy={isLoading}>
              <PaginationContent className="flex-wrap justify-center gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    {...getPageNavigationProps(
                      Math.max(1, currentPage - 1),
                      currentPage === 1 || disabled
                    )}
                    className={
                      currentPage === 1 || controlsDisabled
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                    aria-disabled={currentPage === 1 || controlsDisabled}
                    tabIndex={currentPage === 1 || disabled ? -1 : undefined}
                  />
                </PaginationItem>

                {renderPageNumbers}

                <PaginationItem>
                  <PaginationNext
                    {...getPageNavigationProps(
                      Math.min(totalPages, currentPage + 1),
                      currentPage === totalPages || disabled
                    )}
                    className={
                      currentPage === totalPages || controlsDisabled
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                    aria-disabled={currentPage === totalPages || controlsDisabled}
                    tabIndex={currentPage === totalPages || disabled ? -1 : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>
    );
  }
);

LibraryPagination.displayName = 'LibraryPagination';

export default LibraryPagination;
