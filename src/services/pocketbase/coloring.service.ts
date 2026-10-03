/**
 * Coloring service: CRUD for coloring books and pages
 * @author @serabi
 */

import { pb, resolveFileUrl } from '@/lib/pocketbase';
import {
  ColoringBookTagsResponse,
  ColoringBooksBookFormatOptions,
  ColoringBooksLanguageOptions,
  Collections,
  ColoringBooksResponse,
  ColoringBooksStatusOptions,
  ColoringPagesResponse,
  ColoringPagesStatusOptions,
} from '@/types/pocketbase.types';
import { ErrorHandler } from './base/ErrorHandler';
import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import type { Tag } from '@/types/tag';
import { clearOptionalRelation, normalizeOptionalRelation } from './relationClear';
import { expectedRevisionOptions } from './expectedRevision';
import { ColoringTagService } from './coloringTags.service';
import { isServiceResponseError } from '@/types/shared';
import { createLogger } from '@/utils/logger';
import {
  ensureCurrentSessionAfterCreate,
  isSessionChangedError,
  recordCompletedSessionCreate,
} from '@/services/auth/sessionRecovery';
import { normalizeDateOnlyValue } from '@/utils/date/timezoneUtils';
import { listAllPages } from './base/listAllPages';
import type {
  ColoringCollectionStatsResponse,
  ColoringCompletionTimeStatsResponse,
  ColoringStatsSummaryResponse,
  CompletionsByMonthResponse,
  CompletionsYearlyResponse,
} from '@/types/stats';

const coloringLogger = createLogger('ColoringService');

function requireUserId(): string {
  if (!isAuthenticated()) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  const userId = getCurrentUserId();
  if (!userId) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  return userId;
}

export interface ColoringBookDTO {
  id: string;
  userId: string;
  title: string;
  publisherId: string;
  illustratorId: string;
  series: string;
  theme: string;
  isbn: string;
  publicationYear?: number;
  edition: string;
  language: ColoringBooksLanguageOptions | '';
  sourceUrl: string;
  datePurchased: string;
  dateReceived: string;
  dateStarted: string;
  dateCompleted: string;
  bookFormat: ColoringBooksBookFormatOptions | '';
  notes: string;
  coverImage: string;
  isMystery: boolean;
  status: ColoringBooksStatusOptions;
  totalPages: number;
  completedPages?: number;
  completionPercentage?: number;
  lastActivityAt?: string;
  publisherName?: string;
  illustratorName?: string;
  tags?: Tag[];
  createdAt: string;
  updatedAt: string;
  revision?: number;
}

export interface ColoringPageDTO {
  id: string;
  bookId: string;
  pageNumber: number;
  status: ColoringPagesStatusOptions;
  photos: string[];
  mediumIds: string[];
  revealedSubject: string;
  revealedAt: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColoringBookListOptions {
  userId: string;
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
  expand?: string;
}

export interface ColoringPagesListOptions {
  bookId: string;
  sort?: string;
  expand?: string;
  page?: number;
  perPage?: number;
}

export type CreateColoringBookInput = {
  title: string;
  publisher?: string;
  illustrator?: string;
  series?: string;
  theme?: string;
  isbn?: string;
  publication_year?: number;
  edition?: string;
  language?: ColoringBooksLanguageOptions;
  source_url?: string;
  date_purchased?: string;
  date_received?: string;
  date_started?: string;
  date_completed?: string;
  book_format?: ColoringBooksBookFormatOptions;
  notes?: string;
  cover_image?: File | string;
  is_mystery?: boolean;
  status?: ColoringBooksStatusOptions;
  total_pages?: number;
  completed_pages?: number;
  completion_percentage?: number;
  last_activity_at?: string;
};

export type UpdateColoringBookInput = Partial<
  Omit<CreateColoringBookInput, 'book_format' | 'language' | 'publication_year'>
> & {
  book_format?: ColoringBooksBookFormatOptions | '';
  language?: ColoringBooksLanguageOptions | '';
  publication_year?: number | null;
};

export interface SaveBookWithTagsResult {
  book: ColoringBookDTO;
  tagSyncError?: Error;
}

interface ColoringBookPageReductionResponse {
  bookId: string;
  currentTotalPages: number;
  targetTotalPages: number;
  deletedPages: number;
  remainingPages: number;
  done: boolean;
}

export type UpdateColoringPageInput = Partial<{
  status: ColoringPagesStatusOptions;
  photos: Array<File | string>;
  'photos+': File[];
  'photos-': string[];
  mediums: string[];
  revealed_subject: string;
  revealed_at: string;
  started_at: string;
  completed_at: string;
}>;

type ColoringBookMetricRecord = Omit<ColoringBooksResponse, 'expand'> & {
  expand?: {
    publisher?: { name?: string };
    illustrator?: { name?: string };
    coloring_book_tags_via_book?: Array<
      ColoringBookTagsResponse<{
        tag: {
          id?: string;
          user?: string;
          name?: string;
          slug?: string;
          color?: string;
          created?: string;
          updated?: string;
        };
      }>
    >;
  };
};

type ColoringPageRecordWithMediums = ColoringPagesResponse & {
  mediums?: string[];
};

export interface ListResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
}

function normalizePublicationYear(value?: number): number | undefined {
  return value && value >= 1000 ? value : undefined;
}

function toBookDTO(record: ColoringBooksResponse): ColoringBookDTO {
  const metricRecord = record as ColoringBookMetricRecord;
  const tags =
    metricRecord.expand?.coloring_book_tags_via_book
      ?.map(bookTag => bookTag.expand?.tag)
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag?.id && tag?.name))
      .map(tag => ({
        id: tag.id ?? '',
        userId: tag.user ?? '',
        name: tag.name ?? '',
        slug: tag.slug ?? '',
        color: tag.color ?? '#14b8a6',
        createdAt: tag.created ?? '',
        updatedAt: tag.updated ?? '',
      })) ?? [];

  return {
    id: record.id,
    userId: record.user,
    title: record.title,
    publisherId: record.publisher ?? '',
    illustratorId: record.illustrator ?? '',
    series: record.series ?? '',
    theme: record.theme ?? '',
    isbn: record.isbn ?? '',
    publicationYear: normalizePublicationYear(metricRecord.publication_year),
    edition: metricRecord.edition ?? '',
    language: metricRecord.language ?? '',
    sourceUrl: metricRecord.source_url ?? '',
    datePurchased: normalizeDateOnlyValue(metricRecord.date_purchased),
    dateReceived: normalizeDateOnlyValue(metricRecord.date_received),
    dateStarted: normalizeDateOnlyValue(metricRecord.date_started),
    dateCompleted: normalizeDateOnlyValue(metricRecord.date_completed),
    bookFormat: metricRecord.book_format ?? '',
    notes: metricRecord.notes ?? '',
    coverImage: record.cover_image ?? '',
    isMystery: record.is_mystery,
    status: record.status,
    totalPages: record.total_pages,
    completedPages: metricRecord.completed_pages ?? 0,
    completionPercentage: metricRecord.completion_percentage ?? 0,
    lastActivityAt: metricRecord.last_activity_at ?? record.updated,
    publisherName: metricRecord.expand?.publisher?.name,
    illustratorName: metricRecord.expand?.illustrator?.name,
    tags,
    createdAt: record.created,
    updatedAt: record.updated,
    revision: record.revision ?? 0,
  };
}

function toPageDTO(record: ColoringPagesResponse): ColoringPageDTO {
  const pageRecord = record as ColoringPageRecordWithMediums;
  return {
    id: record.id,
    bookId: record.book,
    pageNumber: record.page_number,
    status: record.status,
    photos: record.photos ?? [],
    mediumIds: pageRecord.mediums ?? [],
    revealedSubject: record.revealed_subject ?? '',
    revealedAt: record.revealed_at ?? '',
    startedAt: normalizeDateOnlyValue(record.started_at),
    completedAt: normalizeDateOnlyValue(record.completed_at),
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function toPayload(data: Record<string, unknown>): FormData | Record<string, unknown> {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const hasFile = Object.values(data).some(
    value =>
      value instanceof File || (Array.isArray(value) && value.some(item => item instanceof File))
  );
  if (!hasFile) {
    return Object.fromEntries(entries.map(([key, value]) => [key, value === null ? '' : value]));
  }

  const formData = new FormData();
  const appendValue = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (value === null) {
      formData.append(key, '');
      return;
    }
    formData.append(key, value instanceof Blob ? value : String(value));
  };

  entries.forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => appendValue(key, item));
      return;
    }
    appendValue(key, value);
  });
  return formData;
}

function shouldTouchBookActivity(data: UpdateColoringBookInput): boolean {
  return Object.keys(data).some(key => key !== 'last_activity_at');
}

function getCompletionPercentage(completedPages: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Number(Math.min(100, Math.max(0, (completedPages / totalPages) * 100)).toFixed(2));
}

function shouldRecalculateBookCompletion(data: UpdateColoringBookInput): boolean {
  return data.total_pages !== undefined || data.completed_pages !== undefined;
}

function runPrimarySaveCallback(callback?: () => void): void {
  try {
    callback?.();
  } catch {
    // Local cleanup must not turn a confirmed server write into a failed save.
  }
}

export class ColoringService {
  private static async reduceBookPagesInBatches(
    bookId: string,
    targetTotalPages: number
  ): Promise<void> {
    let previousTotalPages: number | null = null;
    let previousRemainingPages: number | null = null;

    while (true) {
      const result = await pb.send<ColoringBookPageReductionResponse>(
        `/api/coloring/books/${encodeURIComponent(bookId)}/reduce-pages`,
        {
          method: 'POST',
          body: { targetTotalPages },
        }
      );

      if (result.done) return;

      const totalAdvanced =
        previousTotalPages === null || result.currentTotalPages < previousTotalPages;
      const cleanupAdvanced =
        previousRemainingPages === null || result.remainingPages < previousRemainingPages;
      if (!totalAdvanced && !cleanupAdvanced) {
        throw new Error('Coloring book page reduction did not make progress.');
      }

      previousTotalPages = result.currentTotalPages;
      previousRemainingPages = result.remainingPages;
    }
  }

  private static async getExpandedBookOrFallback(book: ColoringBookDTO): Promise<ColoringBookDTO> {
    try {
      return await this.getBookById(book.id);
    } catch (error) {
      coloringLogger.warn('Could not refresh coloring book after tag sync', error);
      return book;
    }
  }

  static async listBooks(options: ColoringBookListOptions): Promise<ListResult<ColoringBookDTO>> {
    if (!options.userId) throw ErrorHandler.createError('auth', 'User ID is required', false);
    const { page = 1, perPage = 50, sort = 'title', expand, filter } = options;
    const baseFilter = pb.filter('user = {:userId}', { userId: options.userId });
    const finalFilter = filter ? `${baseFilter} && (${filter})` : baseFilter;

    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(Collections.ColoringBooks).getList(page, perPage, {
        filter: finalFilter,
        sort,
        expand,
      });
      return {
        items: result.items.map(toBookDTO),
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        page: result.page,
        perPage: result.perPage,
      };
    }, 'Coloring.listBooks');
  }

  static async listAllBooks(
    options: Omit<ColoringBookListOptions, 'page' | 'perPage'>
  ): Promise<ColoringBookDTO[]> {
    if (!options.userId) throw ErrorHandler.createError('auth', 'User ID is required', false);
    const { sort = 'title', expand, filter } = options;
    const baseFilter = pb.filter('user = {:userId}', { userId: options.userId });
    const finalFilter = filter ? `${baseFilter} && (${filter})` : baseFilter;

    return ErrorHandler.handleAsync(async () => {
      const records = await pb
        .collection(Collections.ColoringBooks)
        .getFullList<ColoringBooksResponse>({
          filter: finalFilter,
          sort,
          expand,
        });
      return records.map(toBookDTO);
    }, 'Coloring.listAllBooks');
  }

  static async getBookById(id: string): Promise<ColoringBookDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.ColoringBooks).getOne(id, {
        expand: 'publisher,illustrator,coloring_book_tags_via_book.tag',
      });
      return toBookDTO(record);
    }, 'Coloring.getBookById');
  }

  static async createBook(data: CreateColoringBookInput): Promise<ColoringBookDTO> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const now = new Date().toISOString();
      const payload = toPayload({
        ...data,
        user: userId,
        publisher: normalizeOptionalRelation(data.publisher),
        illustrator: normalizeOptionalRelation(data.illustrator),
        is_mystery: data.is_mystery ?? false,
        completed_pages: data.completed_pages ?? 0,
        completion_percentage: data.completion_percentage ?? 0,
        last_activity_at: data.last_activity_at ?? now,
      });
      const record = await pb.collection(Collections.ColoringBooks).create(payload);
      return toBookDTO(record);
    }, 'Coloring.createBook');
  }

  static async updateBook(
    id: string,
    data: UpdateColoringBookInput,
    expectedRevision?: number,
    changedTagIds?: string[]
  ): Promise<ColoringBookDTO> {
    return ErrorHandler.handleAsync(async () => {
      const currentBook = shouldRecalculateBookCompletion(data) ? await this.getBookById(id) : null;
      const nextTotalPages = data.total_pages ?? currentBook?.totalPages;
      const nextCompletedPages = data.completed_pages ?? currentBook?.completedPages;
      if (
        data.total_pages !== undefined &&
        currentBook !== null &&
        data.total_pages < currentBook.totalPages &&
        expectedRevision === undefined
      ) {
        await this.reduceBookPagesInBatches(id, data.total_pages);
      }
      const patch = {
        ...data,
        publication_year: data.publication_year === null ? 0 : data.publication_year,
        publisher:
          data.publisher === undefined
            ? undefined
            : (normalizeOptionalRelation(data.publisher) ?? clearOptionalRelation()),
        illustrator:
          data.illustrator === undefined
            ? undefined
            : (normalizeOptionalRelation(data.illustrator) ?? clearOptionalRelation()),
        ...(data.total_pages === undefined &&
        data.completed_pages !== undefined &&
        nextTotalPages !== undefined &&
        nextCompletedPages !== undefined
          ? {
              completion_percentage: getCompletionPercentage(nextCompletedPages, nextTotalPages),
            }
          : {}),
        ...(shouldTouchBookActivity(data) ? { last_activity_at: new Date().toISOString() } : {}),
      };
      const payload = toPayload(patch as Record<string, unknown>);
      if (changedTagIds !== undefined) {
        const encodedTags = JSON.stringify(changedTagIds);
        if (payload instanceof FormData) payload.set('og_tag_ids', encodedTags);
        else payload.og_tag_ids = encodedTags;
      }
      const record =
        expectedRevision === undefined
          ? await pb.collection(Collections.ColoringBooks).update(id, payload)
          : await pb
              .collection(Collections.ColoringBooks)
              .update(id, payload, expectedRevisionOptions(expectedRevision));
      return toBookDTO(record);
    }, 'Coloring.updateBook');
  }

  static async createBookWithTags(
    data: CreateColoringBookInput,
    tagIds: string[],
    onPrimarySave?: () => void
  ): Promise<SaveBookWithTagsResult> {
    const createToken = pb.authStore?.token ?? '';
    const book = await this.createBook(data);
    runPrimarySaveCallback(onPrimarySave);
    try {
      ensureCurrentSessionAfterCreate(createToken, 'coloring_books', book.id);
      if (tagIds.length === 0) return { book };

      const tagSync = await ColoringTagService.syncBookTags(book.id, tagIds);
      ensureCurrentSessionAfterCreate(createToken, 'coloring_books', book.id);
      if (isServiceResponseError(tagSync)) {
        return {
          book,
          tagSyncError: tagSync.error ?? new Error('Could not save coloring book tags'),
        };
      }
      const expandedBook = await this.getExpandedBookOrFallback(book);
      ensureCurrentSessionAfterCreate(createToken, 'coloring_books', book.id);
      return { book: expandedBook };
    } catch (error) {
      if (isSessionChangedError(error))
        recordCompletedSessionCreate(createToken, 'coloring_books', book.id);
      throw error;
    }
  }

  static async updateBookWithTags(
    bookId: string,
    patch: UpdateColoringBookInput,
    tagIds?: string[],
    onPrimarySave?: () => void,
    expectedRevision?: number
  ): Promise<SaveBookWithTagsResult> {
    const book = await this.updateBook(
      bookId,
      patch,
      expectedRevision,
      expectedRevision === undefined ? undefined : tagIds
    );
    runPrimarySaveCallback(onPrimarySave);
    if (expectedRevision !== undefined) {
      return { book: tagIds === undefined ? book : await this.getExpandedBookOrFallback(book) };
    }
    if (tagIds === undefined) return { book };
    const tagSync = await ColoringTagService.syncBookTags(book.id, tagIds);
    if (isServiceResponseError(tagSync)) {
      return {
        book,
        tagSyncError: tagSync.error ?? new Error('Could not save coloring book tags'),
      };
    }
    return { book: await this.getExpandedBookOrFallback(book) };
  }

  static async deleteBook(id: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      await pb.collection(Collections.ColoringBooks).delete(id);
    }, 'Coloring.deleteBook');
  }

  static async listPages(options: ColoringPagesListOptions): Promise<ListResult<ColoringPageDTO>> {
    const { page = 1, perPage = 500, sort = 'page_number', expand, bookId } = options;
    const filter = pb.filter('book = {:bookId}', { bookId });

    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(Collections.ColoringPages).getList(page, perPage, {
        filter,
        sort,
        expand,
      });
      return {
        items: result.items.map(toPageDTO),
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        page: result.page,
        perPage: result.perPage,
      };
    }, 'Coloring.listPages');
  }

  static async listAllPages(
    options: Omit<ColoringPagesListOptions, 'page' | 'perPage'>
  ): Promise<ColoringPageDTO[]> {
    const { sort = 'page_number', expand, bookId } = options;
    const filter = pb.filter('book = {:bookId}', { bookId });

    return ErrorHandler.handleAsync(async () => {
      const records = await pb
        .collection(Collections.ColoringPages)
        .getFullList<ColoringPagesResponse>({
          filter,
          sort,
          expand,
        });
      return records.map(toPageDTO);
    }, 'Coloring.listAllPages');
  }

  static async listAllPagesByBook(
    userId: string,
    bookIds: readonly string[]
  ): Promise<Record<string, ColoringPageDTO[]>> {
    const pagesByBookId = Object.fromEntries(
      bookIds.map(bookId => [bookId, [] as ColoringPageDTO[]])
    );
    if (bookIds.length === 0) return pagesByBookId;

    const filter = pb.filter('book.user = {:userId}', { userId });
    return ErrorHandler.handleAsync(async () => {
      const { items: records } = await listAllPages(
        (page, pageSize) =>
          pb.collection(Collections.ColoringPages).getList<ColoringPagesResponse>(page, pageSize, {
            filter,
            sort: 'book,page_number,id',
          }),
        1000,
        { maxItems: 100_000, recordLabel: 'coloring pages' }
      );
      for (const record of records) {
        if (Object.hasOwn(pagesByBookId, record.book)) {
          pagesByBookId[record.book].push(toPageDTO(record));
        }
      }
      for (const pages of Object.values(pagesByBookId)) {
        pages.sort(
          (left, right) => left.pageNumber - right.pageNumber || left.id.localeCompare(right.id)
        );
      }
      return pagesByBookId;
    }, 'Coloring.listAllPagesByBook');
  }

  static async getPageById(pageId: string): Promise<ColoringPageDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.ColoringPages).getOne(pageId);
      return toPageDTO(record);
    }, 'Coloring.getPageById');
  }

  static async updatePage(
    pageId: string,
    patch: UpdateColoringPageInput
  ): Promise<ColoringPageDTO> {
    return ErrorHandler.handleAsync(async () => {
      const nextPatch = { ...patch };
      const payload = toPayload(nextPatch as Record<string, unknown>);
      const record = await pb.collection(Collections.ColoringPages).update(pageId, payload);
      return toPageDTO(record);
    }, 'Coloring.updatePage');
  }

  static async deletePagePhoto(pageId: string, photoFilename: string): Promise<ColoringPageDTO> {
    return this.updatePage(pageId, { 'photos-': [photoFilename] });
  }

  static async setMainPagePhoto(pageId: string, photoFilename: string): Promise<ColoringPageDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.send<ColoringPagesResponse>(
        `/api/coloring/pages/${encodeURIComponent(pageId)}/main-photo`,
        {
          method: 'POST',
          body: { filename: photoFilename },
        }
      );
      return toPageDTO(record);
    }, 'Coloring.setMainPagePhoto');
  }

  static async getStatsSummary(year: number): Promise<ColoringStatsSummaryResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/coloring/summary', {
        method: 'GET',
        query: { year },
      });
    }, 'Coloring.getStatsSummary');
  }

  static async getCompletionsByMonth(year: number): Promise<CompletionsByMonthResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/coloring/completions', {
        method: 'GET',
        query: { year },
      });
    }, 'Coloring.getCompletionsByMonth');
  }

  static async getCompletionsYearly(): Promise<CompletionsYearlyResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/coloring/completions/yearly', {
        method: 'GET',
      });
    }, 'Coloring.getCompletionsYearly');
  }

  static async getCompletionTimeStats(): Promise<ColoringCompletionTimeStatsResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/coloring/completion-times', {
        method: 'GET',
      });
    }, 'Coloring.getCompletionTimeStats');
  }

  static async getCollectionStats(): Promise<ColoringCollectionStatsResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/coloring/collection', {
        method: 'GET',
      });
    }, 'Coloring.getCollectionStats');
  }

  static getCoverImageUrl(
    book: Pick<ColoringBookDTO, 'id' | 'coverImage'>,
    thumb?: string
  ): string {
    if (!book.coverImage) return '';
    return resolveFileUrl(Collections.ColoringBooks, book.id, book.coverImage, thumb);
  }

  static getPagePhotoUrls(page: Pick<ColoringPageDTO, 'id' | 'photos'>, thumb?: string): string[] {
    return page.photos.map(photo =>
      resolveFileUrl(Collections.ColoringPages, page.id, photo, thumb)
    );
  }
}
