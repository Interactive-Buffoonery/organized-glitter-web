import { useMemo } from 'react';
import {
  ColoringService,
  type ColoringBookDTO,
  type ColoringPageDTO,
} from '@/services/pocketbase/coloring.service';
import { useColoringBook } from '@/hooks/queries/coloring/useColoringBook';
import { useColoringMediums } from '@/hooks/queries/coloring/useColoringMediums';
import { useColoringPage } from '@/hooks/queries/coloring/useColoringPage';
import { useColoringPages } from '@/hooks/queries/coloring/useColoringPages';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { ColoringMediumRecord } from '@/types/coloringMedium';

interface UseColoringPageDetailDataInput {
  bookId?: string;
  pageId?: string;
  userId?: string;
}

interface UseColoringPageDetailDataResult {
  book: ColoringBookDTO | undefined;
  page: ColoringPageDTO | undefined;
  isLoading: boolean;
  error: unknown;
  retry: () => Promise<boolean>;
  pagesError: unknown;
  pagesIsFetching: boolean;
  hasLoadedPages: boolean;
  retryPages: () => Promise<boolean>;
  userTimezone: string;
  pagePhotoUrls: string[];
  mediums: ColoringMediumRecord[];
  isMediumsLoading: boolean;
  previousPage: ColoringPageDTO | null;
  nextPage: ColoringPageDTO | null;
}

function selectDetailError(pageError: unknown, bookError: unknown, pagesError: unknown): unknown {
  const pageFailure = pageError ? ErrorHandler.handleError(pageError) : null;
  const bookFailure = bookError ? ErrorHandler.handleError(bookError) : null;
  const pagesFailure = pagesError ? ErrorHandler.handleError(pagesError) : null;
  if (ErrorHandler.isAccessFailure(pageFailure?.type)) return pageError;
  if (ErrorHandler.isAccessFailure(bookFailure?.type)) return bookError;
  if (ErrorHandler.isAccessFailure(pagesFailure?.type)) return pagesError;
  if (pageFailure?.retryable) return pageError;
  if (bookFailure?.retryable) return bookError;
  return pageError ?? bookError;
}

export function useColoringPageDetailData({
  bookId,
  pageId,
  userId,
}: UseColoringPageDetailDataInput): UseColoringPageDetailDataResult {
  const userTimezone = useUserTimezone();
  const bookQuery = useColoringBook(bookId);
  const pageQuery = useColoringPage(pageId);
  const pagesQuery = useColoringPages(
    bookId ? { bookId, sort: 'page_number', perPage: 500 } : undefined
  );
  const mediumsQuery = useColoringMediums(userId);

  const loadedPage = pageQuery.data;
  const book = bookQuery.data;
  const isPageBookMismatch = Boolean(loadedPage && book && loadedPage.bookId !== book.id);
  const page = isPageBookMismatch ? undefined : loadedPage;
  const allPages = pagesQuery.data?.items ?? [];
  const currentIndex = page ? allPages.findIndex(item => item.id === page.id) : -1;

  const pagePhotoUrls = useMemo(() => (page ? ColoringService.getPagePhotoUrls(page) : []), [page]);

  return {
    book,
    page,
    isLoading: pageQuery.isLoading || bookQuery.isLoading,
    error: isPageBookMismatch
      ? { type: 'not_found', message: 'Coloring page not found', retryable: false }
      : selectDetailError(pageQuery.error, bookQuery.error, pagesQuery.error),
    retry: async () => {
      const results = await Promise.all([
        ...(bookQuery.isError ? [bookQuery.refetch()] : []),
        ...(pageQuery.isError ? [pageQuery.refetch()] : []),
      ]);
      return results.every(result => !result.isError);
    },
    pagesError: pagesQuery.error,
    pagesIsFetching: pagesQuery.isFetching,
    hasLoadedPages: Boolean(pagesQuery.data),
    retryPages: async () => !(await pagesQuery.refetch()).isError,
    userTimezone,
    pagePhotoUrls,
    mediums: mediumsQuery.data?.items ?? [],
    isMediumsLoading: mediumsQuery.isLoading,
    previousPage: currentIndex > 0 ? allPages[currentIndex - 1] : null,
    nextPage:
      currentIndex >= 0 && currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null,
  };
}
