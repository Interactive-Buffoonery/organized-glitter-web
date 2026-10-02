import { useEffect, useMemo, useRef } from 'react';
import { useColoringFilters } from '@/contexts/ColoringFilterContext';
import { useColoringBooks } from '@/hooks/queries/coloring/useColoringBooks';
import {
  buildColoringBookListQueryConfig,
  toColoringBookListCriteria,
} from '@/services/pocketbase/coloringBookQueryBuilder';
import type { ColoringBookCardData } from '@/components/coloring/coloringBookCardTypes';

interface UseColoringListOptions {
  userId: string | undefined;
}

export function useColoringList({ userId }: UseColoringListOptions) {
  const { filters, publishers, isNavigationContextReady = true } = useColoringFilters();

  const queryConfig = useMemo(() => {
    const criteria = toColoringBookListCriteria(filters);
    return buildColoringBookListQueryConfig(criteria, {
      field: filters.sortField,
      direction: filters.sortDirection,
    });
  }, [filters]);

  const booksQuery = useColoringBooks(
    userId && isNavigationContextReady
      ? {
          userId,
          page: filters.currentPage,
          perPage: filters.pageSize,
          filter: queryConfig.filter || undefined,
          sort: queryConfig.sort,
          expand: queryConfig.expand,
        }
      : undefined
  );
  // Keep fallback scoped to the same user and filter/sort identity. Pagination
  // stays out of the signature so a failed next-page fetch can still show the
  // last loaded results instead of an empty error list.
  const queryKeySignature = `${userId ?? ''}|${JSON.stringify(queryConfig)}`;
  const lastSettledDataRef = useRef<{ signature: string; data: typeof booksQuery.data }>({
    signature: queryKeySignature,
    data: booksQuery.data,
  });

  useEffect(() => {
    if (booksQuery.data && !booksQuery.isPlaceholderData) {
      lastSettledDataRef.current = { signature: queryKeySignature, data: booksQuery.data };
    }
  }, [booksQuery.data, booksQuery.isPlaceholderData, queryKeySignature]);

  const settled = lastSettledDataRef.current;
  const listData =
    booksQuery.data ??
    (booksQuery.isError && settled.signature === queryKeySignature ? settled.data : undefined);

  const publisherNameById = useMemo(() => {
    const map = new Map<string, string>();
    publishers.forEach(p => map.set(p.id, p.name));
    return map;
  }, [publishers]);

  const books: ColoringBookCardData[] = useMemo(() => {
    const items = listData?.items ?? [];
    return items.map(book => ({
      ...book,
      publisherName:
        book.publisherName ??
        (book.publisherId ? publisherNameById.get(book.publisherId) : undefined),
    }));
  }, [listData?.items, publisherNameById]);

  return {
    books,
    isLoading: booksQuery.isLoading || !isNavigationContextReady,
    isFetching: booksQuery.isFetching,
    isPlaceholderData: booksQuery.isPlaceholderData,
    isSuccess: booksQuery.isSuccess,
    isError: booksQuery.isError,
    error: booksQuery.error,
    refetch: booksQuery.refetch,
    page: filters.currentPage,
    pageSize: filters.pageSize,
    totalItems: listData?.totalItems,
    totalPages: listData?.totalPages,
  };
}
