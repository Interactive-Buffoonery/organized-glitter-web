import type { ServiceError } from '@/services/types';
import { formatLimitSupportMessage } from '@/lib/contactConfig';

interface PageResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  perPage?: number;
}

type CompleteListErrorReason =
  | 'invalid_page_size'
  | 'invalid_read_limit'
  | 'invalid_total_pages'
  | 'invalid_total_items'
  | 'read_limit_exceeded'
  | 'pagination_changed'
  | 'item_count_mismatch';

class CompleteListError extends Error implements ServiceError {
  readonly type = 'validation';
  readonly retryable = false;

  constructor(
    readonly reason: CompleteListErrorReason,
    message: string
  ) {
    super(message);
    this.name = 'CompleteListError';
  }
}

const PAGE_LOAD_CONCURRENCY = 4;
const DEFAULT_COMPLETE_LIST_LIMIT = 5_000;

export async function listAllPages<T>(
  loadPage: (page: number, pageSize: number) => Promise<PageResult<T>>,
  pageSize = 500,
  {
    maxItems = DEFAULT_COMPLETE_LIST_LIMIT,
    recordLabel = 'records',
  }: {
    maxItems?: number;
    recordLabel?: string;
  } = {}
): Promise<PageResult<T>> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new CompleteListError(
      'invalid_page_size',
      'Invalid page size for complete paginated request'
    );
  }
  if (!Number.isSafeInteger(maxItems) || maxItems <= 0) {
    throw new CompleteListError('invalid_read_limit', 'Invalid complete-read limit');
  }
  const firstPage = await loadPage(1, pageSize);
  const totalPages = firstPage.totalPages;
  if (!Number.isSafeInteger(totalPages) || totalPages < 0) {
    throw new CompleteListError(
      'invalid_total_pages',
      'Invalid total page count returned by paginated request'
    );
  }
  const totalItems = firstPage.totalItems;
  if (!Number.isSafeInteger(totalItems) || totalItems < 0) {
    throw new CompleteListError(
      'invalid_total_items',
      'Invalid total item count returned by paginated request'
    );
  }
  const effectivePageSize = firstPage.perPage ?? pageSize;
  if (!Number.isSafeInteger(effectivePageSize) || effectivePageSize <= 0) {
    throw new CompleteListError(
      'invalid_page_size',
      'Invalid page size returned by paginated request'
    );
  }
  if (totalItems > maxItems || totalPages > Math.ceil(maxItems / effectivePageSize)) {
    throw new CompleteListError(
      'read_limit_exceeded',
      formatLimitSupportMessage(maxItems, recordLabel)
    );
  }
  const items: T[] = [];
  const appendItems = (nextItems: T[]) => {
    if (items.length + nextItems.length > totalItems) {
      throw new CompleteListError(
        'item_count_mismatch',
        'Paginated request returned more items than its declared total'
      );
    }
    for (const item of nextItems) items.push(item);
  };
  appendItems(firstPage.items);
  for (let page = 2; page <= totalPages; page += PAGE_LOAD_CONCURRENCY) {
    const pageNumbers = Array.from(
      { length: Math.min(PAGE_LOAD_CONCURRENCY, totalPages - page + 1) },
      (_, index) => page + index
    );
    const batch = await Promise.all(pageNumbers.map(pageNumber => loadPage(pageNumber, pageSize)));
    for (const result of batch) {
      if (result.totalPages !== totalPages || result.totalItems !== totalItems) {
        throw new CompleteListError(
          'pagination_changed',
          'Pagination metadata changed while loading the complete list'
        );
      }
      appendItems(result.items);
    }
  }
  if (items.length !== totalItems) {
    throw new CompleteListError(
      'item_count_mismatch',
      `Paginated request returned ${items.length} items but declared ${totalItems} total items`
    );
  }

  return { items, totalItems, totalPages };
}
