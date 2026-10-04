import type { QueryClient, QueryFilters } from '@tanstack/react-query';
import type { ListResult } from 'pocketbase';

import {
  applyColoringPageOptimisticPatch,
  type ColoringPageCommandEffects,
} from '@/features/coloring-progress/coloringProgressCommands';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { queryKeys } from '@/hooks/queries/queryKeys';
import type {
  ColoringBookDTO,
  ColoringPageDTO,
  ColoringPagesListOptions,
  UpdateColoringPageInput,
} from '@/services/pocketbase/coloring.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('coloringMutationCache');

const settleInvalidations = async (
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
  label: string,
  errorField: 'error' | 'reason' = 'error'
): Promise<void> => {
  const results = await Promise.allSettled(
    keys.map(async queryKey => queryClient.invalidateQueries({ queryKey }))
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(label, { index, [errorField]: result.reason });
    }
  });
};

const deferInvalidations = (
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
  label: string
): void => {
  void Promise.resolve().then(() => settleInvalidations(queryClient, keys, label));
};

export const getCachedColoringBook = (queryClient: QueryClient, bookId: string) =>
  queryClient.getQueryData<ColoringBookDTO>(queryKeys.coloring.books.detail(bookId));

export const cacheCreatedColoringBook = (queryClient: QueryClient, book: ColoringBookDTO): void => {
  runPostWriteEffect(logger, 'Coloring book cache write failed after creation', () => {
    queryClient.setQueryData(queryKeys.coloring.books.detail(book.id), book);
  });
  deferInvalidations(
    queryClient,
    [queryKeys.coloring.books.all],
    'Coloring book cache refresh failed after creation'
  );
};

export const cacheUpdatedColoringBook = (queryClient: QueryClient, book: ColoringBookDTO): void => {
  runPostWriteEffect(logger, 'Coloring book cache write failed after update', () => {
    queryClient.setQueryData(queryKeys.coloring.books.detail(book.id), book);
  });
  deferInvalidations(
    queryClient,
    [queryKeys.coloring.books.all, queryKeys.coloring.books.detail(book.id)],
    'Coloring book cache refresh failed after update'
  );
};

export const refreshFailedColoringBookUpdate = (queryClient: QueryClient, bookId: string): void => {
  void settleInvalidations(
    queryClient,
    [
      queryKeys.coloring.books.all,
      queryKeys.coloring.books.detail(bookId),
      queryKeys.coloring.pages.all,
    ],
    'Coloring book cache refresh failed after update error'
  );
};

export const clearDeletedColoringBook = async (
  queryClient: QueryClient,
  bookId: string
): Promise<void> => {
  const deletedQueries: QueryFilters[] = [
    { queryKey: queryKeys.coloring.books.detail(bookId) },
    { queryKey: queryKeys.coloring.tags.book(bookId) },
    {
      queryKey: queryKeys.coloring.pages.all,
      predicate: query => {
        if (query.queryKey[1] === 'list' && typeof query.queryKey[2] === 'string') {
          const filters = JSON.parse(query.queryKey[2]) as ColoringPagesListOptions;
          return filters.bookId === bookId;
        }
        return (query.state.data as ColoringPageDTO | undefined)?.bookId === bookId;
      },
    },
  ];
  const results = await Promise.allSettled(
    deletedQueries.map(async filters => {
      await queryClient.cancelQueries(filters);
      if (filters.queryKey === queryKeys.coloring.pages.all) {
        for (const [key, data] of queryClient.getQueriesData<
          ListResult<ColoringPageDTO> | ColoringPageDTO
        >({
          ...filters,
          type: 'active',
        })) {
          if (key[1] === 'list' && data) {
            queryClient.setQueryData(key, { ...data, items: [], totalItems: 0, totalPages: 0 });
          } else if (key[1] === 'detail') {
            queryClient.setQueryData(key, null);
          }
        }
      }
      await queryClient.invalidateQueries({ ...filters, refetchType: 'none' });
      queryClient.removeQueries({ ...filters, type: 'inactive' });
    })
  );
  results.forEach(result => {
    if (result.status === 'rejected') {
      logger.error('Deleted coloring book cache cleanup failed', result.reason);
    }
  });
  void settleInvalidations(
    queryClient,
    [queryKeys.coloring.books.lists(), queryKeys.coloring.tags.stats()],
    'Coloring book cache refresh failed after delete'
  );
};

export const refreshColoringBookAfterFormSave = (
  queryClient: QueryClient,
  bookId: string,
  operation: 'create' | 'update'
): Promise<void> =>
  settleInvalidations(
    queryClient,
    [
      queryKeys.coloring.books.all,
      queryKeys.coloring.pages.all,
      queryKeys.coloring.books.detail(bookId),
      queryKeys.coloring.tags.stats(),
    ],
    operation === 'create'
      ? 'Post-create coloring book cache invalidation failed'
      : 'Post-update coloring book cache invalidation failed',
    'reason'
  );

export const refreshColoringBookTags = (queryClient: QueryClient, bookId: string): Promise<void> =>
  settleInvalidations(
    queryClient,
    [
      queryKeys.coloring.books.all,
      queryKeys.coloring.books.detail(bookId),
      queryKeys.coloring.tags.book(bookId),
      queryKeys.coloring.tags.stats(),
    ],
    'Coloring book tag cache refresh failed'
  );

export const getCachedColoringPage = (queryClient: QueryClient, pageId: string) =>
  queryClient.getQueryData<ColoringPageDTO>(queryKeys.coloring.pages.detail(pageId));

export const beginColoringPageMutation = async (
  queryClient: QueryClient,
  pageId: string,
  patch: UpdateColoringPageInput | undefined,
  effects: ColoringPageCommandEffects
): Promise<ColoringPageDTO | undefined> => {
  const key = queryKeys.coloring.pages.detail(pageId);
  await queryClient.cancelQueries({ queryKey: key });
  const previousPage = queryClient.getQueryData<ColoringPageDTO>(key);
  if (previousPage && patch && effects.shouldOptimisticallyUpdateDetail) {
    queryClient.setQueryData(key, applyColoringPageOptimisticPatch(previousPage, patch));
  }
  return previousPage;
};

export const cacheUpdatedColoringPage = (
  queryClient: QueryClient,
  page: ColoringPageDTO,
  effects: ColoringPageCommandEffects
): void => {
  runPostWriteEffect(logger, 'Coloring page cache write failed after update', () => {
    queryClient.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
  });
  const invalidations = [];
  if (effects.shouldRefreshPageLists) {
    invalidations.push(queryKeys.coloring.pages.all);
  }
  if (effects.shouldRefreshBookProgress) {
    invalidations.push(queryKeys.coloring.books.detail(page.bookId));
    invalidations.push(queryKeys.coloring.books.lists());
  }
  void settleInvalidations(
    queryClient,
    invalidations,
    'Coloring page cache refresh failed after update'
  );
};

export const restoreColoringPage = (
  queryClient: QueryClient,
  pageId: string,
  previousPage: ColoringPageDTO | undefined
): void => {
  if (previousPage) {
    runPostWriteEffect(logger, 'Coloring page cache rollback failed', () => {
      queryClient.setQueryData(queryKeys.coloring.pages.detail(pageId), previousPage);
    });
  }
};

export const refreshSettledColoringPage = (
  queryClient: QueryClient,
  pageId: string,
  effects: ColoringPageCommandEffects
): void => {
  const invalidations = [];
  if (effects.shouldRefreshPageDetail) {
    invalidations.push(queryKeys.coloring.pages.detail(pageId));
  }
  if (effects.shouldRefreshPageLists) {
    invalidations.push(queryKeys.coloring.pages.all);
  }
  void settleInvalidations(
    queryClient,
    invalidations,
    'Coloring page cache refresh failed after settle'
  );
};
