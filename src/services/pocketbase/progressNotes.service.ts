/**
 * Progress notes service: CRUD operations for project progress notes
 * Returns note models ready for UI consumption where needed.
 * @author @serabi
 */

import { getFileUrl, pb } from '@/lib/pocketbase';
import { Collections } from '@/types/pocketbase.types';
import { ErrorHandler } from './base/ErrorHandler';
import { createLogger } from '@/utils/logger';
import { deleteBatch } from './base/batchDelete';
import { createFilter } from '@/services/pocketbase/base/filterBuilder';
import { ProgressNote } from '@/types/project';
import type { MarkdownString } from '@/types/markdown';
import { normalizeDateOnlyValue } from '@/utils/date/timezoneUtils';
import { mapWithConcurrency } from './base/mapWithConcurrency';
import { fetchLatestNotes } from './base/latestNotes';
import type { NoteListCursor } from './base/noteListCursor';

const logger = createLogger('ProgressNotesService');
const LATEST_NOTE_QUERY_CONCURRENCY = 6;

/**
 * Raw progress note record shape from PocketBase.
 * content/image are required strings here (rather than optional) because the
 * service mappers and downstream hooks rely on always-present scalars; if the
 * underlying PB record omits them, treat as empty string at the boundary.
 */
export interface ProgressNoteRecord {
  id: string;
  project: string;
  content: MarkdownString;
  date: string;
  image: string;
  created: string;
  updated: string;
}

interface ExpandedEntityRecord {
  id: string;
  name?: string;
}

interface ExpandedProjectRecord {
  id: string;
  title?: string;
  expand?: {
    company?: ExpandedEntityRecord;
    artist?: ExpandedEntityRecord;
  };
}

interface ProgressNoteExpand {
  project?: ExpandedProjectRecord;
}

export interface ProgressNoteListItem extends ProgressNote {
  imageFilename?: string;
  project?: {
    id: string;
    title?: string;
    company?: string;
    artist?: string;
  };
}

export interface ProgressNotesListOptions {
  userId: string;
  page: number;
  perPage: number;
  projectId?: string;
  year?: number;
  hasImage?: boolean;
  cursor?: NoteListCursor;
}

export interface ProgressNotesListResult {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: ProgressNoteListItem[];
  nextCursor?: NoteListCursor;
}

export interface ProgressNotesLatestOptions {
  userId: string;
  projectIds: string[];
}

export interface ProgressNoteLatestSummary {
  id: string;
  projectId: string;
  date: string;
  createdAt: string;
}

type ProgressNoteRecordWithExpand = ProgressNoteRecord & {
  expand?: ProgressNoteExpand;
};

function toDateOnlyString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toProgressNoteListItem(record: ProgressNoteRecordWithExpand): ProgressNoteListItem {
  const expandedProject = record.expand?.project;

  return {
    id: record.id,
    projectId: record.project,
    content: record.content,
    date: normalizeDateOnlyValue(record.date),
    imageUrl: record.image
      ? getFileUrl({ id: record.id, collectionName: Collections.ProgressNotes }, record.image)
      : undefined,
    imageFilename: record.image || undefined,
    createdAt: record.created,
    updatedAt: record.updated,
    project: expandedProject
      ? {
          id: expandedProject.id,
          title: expandedProject.title,
          company: expandedProject.expand?.company?.name,
          artist: expandedProject.expand?.artist?.name,
        }
      : undefined,
  };
}

export class ProgressNotesService {
  /** List all progress notes for a project */
  static async listByProject(projectId: string): Promise<ProgressNoteListItem[]> {
    return ErrorHandler.handleAsync(async () => {
      const filter = pb.filter('project = {:projectId}', { projectId });
      const notes = await pb.collection(Collections.ProgressNotes).getFullList<ProgressNoteRecord>({
        filter,
        sort: '-date,-created',
      });

      return notes.map(note => toProgressNoteListItem(note as ProgressNoteRecordWithExpand));
    }, 'ProgressNotes.listByProject');
  }

  /** List the latest progress note for each requested project. */
  static async listLatestForProjects(
    options: ProgressNotesLatestOptions
  ): Promise<Record<string, ProgressNoteLatestSummary>> {
    const { userId, projectIds } = options;
    if (projectIds.length === 0) {
      return {};
    }

    return ErrorHandler.handleAsync(async () => {
      const rows = await fetchLatestNotes('diamond', userId, projectIds);
      if (rows !== null) {
        return Object.fromEntries(
          rows.map(note => [
            note.targetId,
            {
              id: note.id,
              projectId: note.targetId,
              date: normalizeDateOnlyValue(note.date),
              createdAt: note.created,
            },
          ])
        );
      }
      const summaries = await mapWithConcurrency(
        projectIds,
        LATEST_NOTE_QUERY_CONCURRENCY,
        async projectId => {
          const result = await pb
            .collection(Collections.ProgressNotes)
            .getList<ProgressNoteRecord>(1, 1, {
              filter: pb.filter('project.user = {:userId} && project = {:projectId}', {
                userId,
                projectId,
              }),
              sort: '-date,-created,-id',
              fields: 'id,project,date,created',
              skipTotal: true,
              requestKey: null,
            });
          const note = result.items[0];
          return note
            ? {
                id: note.id,
                projectId: note.project,
                date: normalizeDateOnlyValue(note.date),
                createdAt: note.created,
              }
            : null;
        }
      );

      return summaries.reduce<Record<string, ProgressNoteLatestSummary>>((latest, summary) => {
        if (summary) latest[summary.projectId] = summary;
        return latest;
      }, {});
    }, 'ProgressNotes.listLatestForProjects');
  }

  /** List progress notes across projects within a date range for a user. */
  static async listByDateRange(
    userId: string,
    start: Date,
    end: Date
  ): Promise<ProgressNoteListItem[]> {
    return ErrorHandler.handleAsync(async () => {
      const dateFilter = createFilter()
        .dateRange('date', {
          startDate: toDateOnlyString(start),
          endDate: toDateOnlyString(end),
        })
        .build();
      const userFilter = pb.filter('project.user = {:userId}', { userId });
      const filter = [userFilter, dateFilter].filter(Boolean).join(' && ');

      const notes = await pb.collection(Collections.ProgressNotes).getFullList<ProgressNoteRecord>({
        filter,
        sort: '-date,-created',
        expand: 'project,project.company,project.artist',
      });

      return notes.map(note => toProgressNoteListItem(note as ProgressNoteRecordWithExpand));
    }, 'ProgressNotes.listByDateRange');
  }

  /** Paginated progress notes feed for a user, with optional filters. */
  static async listForUser(options: ProgressNotesListOptions): Promise<ProgressNotesListResult> {
    return ErrorHandler.handleAsync(async () => {
      const filters = [pb.filter('project.user = {:userId}', { userId: options.userId })];

      if (options.projectId) {
        filters.push(pb.filter('project = {:projectId}', { projectId: options.projectId }));
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
        .collection(Collections.ProgressNotes)
        .getList<ProgressNoteRecordWithExpand>(options.page, options.perPage, {
          filter: filters.filter(Boolean).join(' && '),
          sort: '-date,-created,-id',
          expand: 'project,project.company,project.artist',
          skipTotal: Boolean(options.cursor),
        });
      const lastItem = result.items.at(-1);

      return {
        page: result.page,
        perPage: result.perPage,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        items: result.items.map(toProgressNoteListItem),
        nextCursor: lastItem
          ? { id: lastItem.id, date: lastItem.date, createdAt: lastItem.created }
          : undefined,
      };
    }, 'ProgressNotes.listForUser');
  }

  static async listAllForUser(
    options: Omit<ProgressNotesListOptions, 'page' | 'perPage'>
  ): Promise<ProgressNoteListItem[]> {
    return ErrorHandler.handleAsync(async () => {
      const filters = [pb.filter('project.user = {:userId}', { userId: options.userId })];

      if (options.projectId) {
        filters.push(pb.filter('project = {:projectId}', { projectId: options.projectId }));
      }

      if (typeof options.year === 'number' && !isNaN(options.year)) {
        filters.push(createFilter().dateRange('date', { year: options.year }).build());
      }

      if (options.hasImage) {
        filters.push(createFilter().notEquals('image', '').build());
      }

      const notes = await pb
        .collection(Collections.ProgressNotes)
        .getFullList<ProgressNoteRecordWithExpand>({
          filter: filters.filter(Boolean).join(' && '),
          sort: '-date,-created',
          expand: 'project,project.company,project.artist',
        });

      return notes.map(toProgressNoteListItem);
    }, 'ProgressNotes.listAllForUser');
  }

  /** Create a progress note (supports image file upload via FormData) */
  static async create(data: {
    project: string;
    content: MarkdownString;
    date: string;
    imageFile?: File;
  }): Promise<ProgressNoteRecord> {
    return ErrorHandler.handleAsync(async () => {
      const payload: Record<string, unknown> = {
        project: data.project,
        content: data.content,
        date: data.date,
      };

      if (data.imageFile) {
        payload.image = data.imageFile;
      }

      logger.debug('Creating progress note', { project: data.project, date: data.date });
      const record = await pb.collection(Collections.ProgressNotes).create(payload);
      return record as unknown as ProgressNoteRecord;
    }, 'ProgressNotes.create');
  }

  /** Update a progress note's content */
  static async updateContent(noteId: string, content: MarkdownString): Promise<ProgressNoteRecord> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.ProgressNotes).update(noteId, { content });
      return record as unknown as ProgressNoteRecord;
    }, 'ProgressNotes.updateContent');
  }

  /** Delete a progress note */
  static async delete(noteId: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      await pb.collection(Collections.ProgressNotes).delete(noteId);
    }, 'ProgressNotes.delete');
  }

  /** Remove image from a progress note */
  static async removeImage(noteId: string): Promise<ProgressNoteRecord> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.ProgressNotes).update(noteId, { image: null });
      return record as unknown as ProgressNoteRecord;
    }, 'ProgressNotes.removeImage');
  }

  /** Delete all progress notes for a project (used during project deletion) */
  static async deleteAllForProject(projectId: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      const notes = await pb.collection(Collections.ProgressNotes).getFullList({
        filter: pb.filter('project = {:projectId}', { projectId }),
        fields: 'id',
      });
      await deleteBatch(
        notes.map(n => n.id),
        id => pb.collection(Collections.ProgressNotes).delete(id)
      );
      logger.info(`Deleted ${notes.length} progress notes for project ${projectId}`);
    }, 'ProgressNotes.deleteAllForProject');
  }
}
