/**
 * Coloring page progress notes service.
 * Mirrors diamond progress notes, but scopes records to a coloring page.
 */

import { getFileUrl, pb } from '@/lib/pocketbase';
import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import { Collections } from '@/types/pocketbase.types';
import { ErrorHandler } from './base/ErrorHandler';
import { createLogger } from '@/utils/logger';
import { deleteBatch } from './base/batchDelete';
import type { MarkdownString } from '@/types/markdown';
import { normalizeDateOnlyValue } from '@/utils/date/timezoneUtils';
import { createFilter } from '@/services/pocketbase/base/filterBuilder';
import { mapWithConcurrency } from './base/mapWithConcurrency';
import { fetchLatestNotes } from './base/latestNotes';
import type { NoteListCursor } from './base/noteListCursor';

const logger = createLogger('ColoringPageProgressNotesService');
const LATEST_NOTE_QUERY_CONCURRENCY = 6;

function requireUserId(): string {
  if (!isAuthenticated()) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  const userId = getCurrentUserId();
  if (!userId) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  return userId;
}

export interface ColoringPageProgressNoteDTO {
  id: string;
  pageId: string;
  content: MarkdownString;
  date: string;
  imageUrl?: string;
  imageFilename?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExpandedEntityRecord {
  id: string;
  name?: string;
}

interface ExpandedColoringBookRecord {
  id: string;
  title?: string;
  expand?: {
    publisher?: ExpandedEntityRecord;
    illustrator?: ExpandedEntityRecord;
  };
}

interface ExpandedColoringPageRecord {
  id: string;
  page_number?: number;
  book?: string;
  expand?: {
    book?: ExpandedColoringBookRecord;
  };
}

interface ColoringPageProgressNoteExpand {
  page?: ExpandedColoringPageRecord;
}

export interface ColoringPageProgressNoteListItem extends ColoringPageProgressNoteDTO {
  page?: {
    id: string;
    pageNumber?: number;
    bookId?: string;
    bookTitle?: string;
    publisher?: string;
    illustrator?: string;
  };
}

export interface ColoringPageProgressNotesListOptions {
  userId: string;
  page: number;
  perPage: number;
  sourceId?: string;
  year?: number;
  hasImage?: boolean;
  cursor?: NoteListCursor;
}

export interface ColoringPageProgressNotesListResult {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: ColoringPageProgressNoteListItem[];
  nextCursor?: NoteListCursor;
}

export interface ColoringPageProgressNotesLatestOptions {
  userId: string;
  pageIds: string[];
}

export interface ColoringPageProgressNoteLatestSummary {
  id: string;
  pageId: string;
  date: string;
  createdAt: string;
}

interface ColoringPageProgressNoteRecord {
  id: string;
  user: string;
  page: string;
  content: MarkdownString;
  date: string;
  image: string;
  created: string;
  updated: string;
  expand?: ColoringPageProgressNoteExpand;
}

function toColoringPageProgressNoteDTO(
  record: ColoringPageProgressNoteRecord
): ColoringPageProgressNoteDTO {
  return {
    id: record.id,
    pageId: record.page,
    content: record.content ?? '',
    date: normalizeDateOnlyValue(record.date),
    imageUrl: record.image
      ? getFileUrl(
          { id: record.id, collectionName: Collections.ColoringPageProgressNotes },
          record.image
        )
      : undefined,
    imageFilename: record.image || undefined,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function toColoringPageProgressNoteListItem(
  record: ColoringPageProgressNoteRecord
): ColoringPageProgressNoteListItem {
  const base = toColoringPageProgressNoteDTO(record);
  const expandedPage = record.expand?.page;
  const expandedBook = expandedPage?.expand?.book;

  return {
    ...base,
    page: expandedPage
      ? {
          id: expandedPage.id,
          pageNumber: expandedPage.page_number,
          bookId: expandedBook?.id ?? expandedPage.book,
          bookTitle: expandedBook?.title,
          publisher: expandedBook?.expand?.publisher?.name,
          illustrator: expandedBook?.expand?.illustrator?.name,
        }
      : undefined,
  };
}

export class ColoringPageProgressNotesService {
  static async listForUser(
    options: ColoringPageProgressNotesListOptions
  ): Promise<ColoringPageProgressNotesListResult> {
    return ErrorHandler.handleAsync(async () => {
      const filters = [pb.filter('user = {:userId}', { userId: options.userId })];

      if (options.sourceId) {
        filters.push(pb.filter('page.book = {:sourceId}', { sourceId: options.sourceId }));
      }

      if (typeof options.year === 'number' && !isNaN(options.year)) {
        filters.push(createFilter().dateRange('date', { year: options.year }).build());
      }

      if (options.hasImage) {
        filters.push(createFilter().notEquals('image', '').build());
      }

      if (options.cursor) {
        filters.push(
          pb.filter(
            '(date < {:cursorDate} || (date = {:cursorDate} && created < {:cursorCreated}) || (date = {:cursorDate} && created = {:cursorCreated} && id < {:cursorId}))',
            {
              cursorDate: options.cursor.date,
              cursorCreated: options.cursor.createdAt,
              cursorId: options.cursor.id,
            }
          )
        );
      }

      const result = await pb
        .collection(Collections.ColoringPageProgressNotes)
        .getList<ColoringPageProgressNoteRecord>(options.page, options.perPage, {
          filter: filters.filter(Boolean).join(' && '),
          sort: '-date,-created,-id',
          expand: 'page,page.book,page.book.publisher,page.book.illustrator',
          skipTotal: Boolean(options.cursor),
        });
      const lastItem = result.items.at(-1);

      return {
        page: result.page,
        perPage: result.perPage,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        items: result.items.map(toColoringPageProgressNoteListItem),
        nextCursor: lastItem
          ? { id: lastItem.id, date: lastItem.date, createdAt: lastItem.created }
          : undefined,
      };
    }, 'ColoringPageProgressNotes.listForUser');
  }

  static async listAllForUser(
    options: Omit<ColoringPageProgressNotesListOptions, 'page' | 'perPage'>
  ): Promise<ColoringPageProgressNoteListItem[]> {
    return ErrorHandler.handleAsync(async () => {
      const filters = [pb.filter('user = {:userId}', { userId: options.userId })];

      if (options.sourceId) {
        filters.push(pb.filter('page.book = {:sourceId}', { sourceId: options.sourceId }));
      }

      if (typeof options.year === 'number' && !isNaN(options.year)) {
        filters.push(createFilter().dateRange('date', { year: options.year }).build());
      }

      if (options.hasImage) {
        filters.push(createFilter().notEquals('image', '').build());
      }

      const notes = await pb
        .collection(Collections.ColoringPageProgressNotes)
        .getFullList<ColoringPageProgressNoteRecord>({
          filter: filters.filter(Boolean).join(' && '),
          sort: '-date,-created',
          expand: 'page,page.book,page.book.publisher,page.book.illustrator',
        });

      return notes.map(toColoringPageProgressNoteListItem);
    }, 'ColoringPageProgressNotes.listAllForUser');
  }

  static async listByPage(pageId: string): Promise<ColoringPageProgressNoteDTO[]> {
    return ErrorHandler.handleAsync(async () => {
      const filter = pb.filter('page = {:pageId}', { pageId });
      const notes = await pb
        .collection(Collections.ColoringPageProgressNotes)
        .getFullList<ColoringPageProgressNoteRecord>({
          filter,
          sort: '-date,-created',
        });

      return notes.map(toColoringPageProgressNoteDTO);
    }, 'ColoringPageProgressNotes.listByPage');
  }

  static async listLatestForPages(
    options: ColoringPageProgressNotesLatestOptions
  ): Promise<Record<string, ColoringPageProgressNoteLatestSummary>> {
    const { userId, pageIds } = options;
    if (pageIds.length === 0) {
      return {};
    }

    return ErrorHandler.handleAsync(async () => {
      const rows = await fetchLatestNotes('coloring', userId, pageIds);
      if (rows !== null) {
        return Object.fromEntries(
          rows.map(note => [
            note.targetId,
            {
              id: note.id,
              pageId: note.targetId,
              date: normalizeDateOnlyValue(note.date),
              createdAt: note.created,
            },
          ])
        );
      }
      const summaries = await mapWithConcurrency(
        pageIds,
        LATEST_NOTE_QUERY_CONCURRENCY,
        async pageId => {
          const result = await pb
            .collection(Collections.ColoringPageProgressNotes)
            .getList<ColoringPageProgressNoteRecord>(1, 1, {
              filter: pb.filter(
                'user = {:userId} && page.book.user = {:userId} && page = {:pageId}',
                { userId, pageId }
              ),
              sort: '-date,-created,-id',
              fields: 'id,page,date,created',
              skipTotal: true,
              requestKey: null,
            });
          const note = result.items[0];
          return note
            ? {
                id: note.id,
                pageId: note.page,
                date: normalizeDateOnlyValue(note.date),
                createdAt: note.created,
              }
            : null;
        }
      );

      return summaries.reduce<Record<string, ColoringPageProgressNoteLatestSummary>>(
        (latest, summary) => {
          if (summary) latest[summary.pageId] = summary;
          return latest;
        },
        {}
      );
    }, 'ColoringPageProgressNotes.listLatestForPages');
  }

  static async create(data: {
    page: string;
    content: MarkdownString;
    date: string;
    imageFile?: File;
  }): Promise<ColoringPageProgressNoteDTO> {
    return ErrorHandler.handleAsync(async () => {
      const userId = requireUserId();
      const payload: Record<string, unknown> = {
        user: userId,
        page: data.page,
        content: data.content,
        date: data.date,
      };

      if (data.imageFile) {
        payload.image = data.imageFile;
      }

      logger.debug('Creating coloring page progress note', {
        page: data.page,
        date: data.date,
      });
      const record = await pb.collection(Collections.ColoringPageProgressNotes).create(payload);
      return toColoringPageProgressNoteDTO(record as unknown as ColoringPageProgressNoteRecord);
    }, 'ColoringPageProgressNotes.create');
  }

  static async updateContent(
    noteId: string,
    content: MarkdownString
  ): Promise<ColoringPageProgressNoteDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb
        .collection(Collections.ColoringPageProgressNotes)
        .update(noteId, { content });
      return toColoringPageProgressNoteDTO(record as unknown as ColoringPageProgressNoteRecord);
    }, 'ColoringPageProgressNotes.updateContent');
  }

  static async delete(noteId: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      await pb.collection(Collections.ColoringPageProgressNotes).delete(noteId);
    }, 'ColoringPageProgressNotes.delete');
  }

  static async removeImage(noteId: string): Promise<ColoringPageProgressNoteDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb
        .collection(Collections.ColoringPageProgressNotes)
        .update(noteId, { image: null });
      return toColoringPageProgressNoteDTO(record as unknown as ColoringPageProgressNoteRecord);
    }, 'ColoringPageProgressNotes.removeImage');
  }

  static async deleteAllForPage(pageId: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      const notes = await pb.collection(Collections.ColoringPageProgressNotes).getFullList({
        filter: pb.filter('page = {:pageId}', { pageId }),
        fields: 'id',
      });
      await deleteBatch(
        notes.map(note => note.id),
        id => pb.collection(Collections.ColoringPageProgressNotes).delete(id),
        { throwOnFailure: true }
      );
      logger.info(`Deleted ${notes.length} coloring page progress notes for page ${pageId}`);
    }, 'ColoringPageProgressNotes.deleteAllForPage');
  }
}
