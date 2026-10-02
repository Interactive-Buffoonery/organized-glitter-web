import type { MarkdownString } from '@/types/markdown';
import {
  IMAGE_MAX_FILE_SIZE_BYTES,
  hasSupportedImageExtension,
  isSupportedImageMime,
  normalizeImageFile,
} from '@/utils/image/imagePolicy';
import { compressProjectImage } from '@/utils/image/projectImageCompression';
import { compressProgressImage } from '@/utils/image/progressImageCompression';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ColoringService, type ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { ProgressNotesService } from '@/services/pocketbase/progressNotes.service';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';
import { captureImportExportException } from '@/features/import-export/importExportTelemetry';
import { toDateOnly } from '@/features/import-export/dateOnly';
import type {
  BulkPhotoImportResult,
  BulkPhotoLibrary,
  BulkPhotoReviewRow,
  BulkPhotoTargetType,
} from '@/features/import-export/bulk-photos/types';
import { kindForTargetType } from '@/features/import-export/bulk-photos/targetKinds';

const DEFAULT_PROGRESS_NOTE_BODY = 'Imported photo' as MarkdownString;
const COLORING_PAGE_PHOTO_LIMIT = 99;

export interface BulkPhotoImportAdapter {
  updateProjectCover(projectId: string, file: File): Promise<void>;
  createProjectProgressNote(
    projectId: string,
    file: File,
    date: string,
    note: string
  ): Promise<void>;
  updateColoringBookCover(bookId: string, file: File): Promise<void>;
  appendColoringPagePhoto(
    pageId: string,
    file: File,
    currentPhotos: string[]
  ): Promise<ColoringPageDTO>;
  createColoringPageProgressNote(
    pageId: string,
    file: File,
    date: string,
    note: string
  ): Promise<void>;
}

export interface ImportBulkPhotosOptions {
  concurrency?: number;
  adapter?: BulkPhotoImportAdapter;
  now?: Date;
}

function lastModifiedDate(file: File): string {
  return toDateOnly(new Date(file.lastModified || Date.now()));
}

function getDefaultAdapter(): BulkPhotoImportAdapter {
  return {
    async updateProjectCover(projectId, file) {
      const formData = new FormData();
      formData.append('image', file);
      await projectsService.update(projectId, formData);
    },
    async createProjectProgressNote(projectId, file, date, note) {
      await ProgressNotesService.create({
        project: projectId,
        content: (note || DEFAULT_PROGRESS_NOTE_BODY) as MarkdownString,
        date,
        imageFile: file,
      });
    },
    async updateColoringBookCover(bookId, file) {
      await ColoringService.updateBook(bookId, { cover_image: file });
    },
    async appendColoringPagePhoto(pageId, file, _currentPhotos) {
      return ColoringService.updatePage(pageId, { 'photos+': [file] });
    },
    async createColoringPageProgressNote(pageId, file, date, note) {
      await ColoringPageProgressNotesService.create({
        page: pageId,
        content: (note || DEFAULT_PROGRESS_NOTE_BODY) as MarkdownString,
        date,
        imageFile: file,
      });
    },
  };
}

function validateImageFile(file: File): void {
  if (file.size > IMAGE_MAX_FILE_SIZE_BYTES) {
    throw new Error('Image exceeds the 50MB upload limit');
  }

  if (!isSupportedImageMime(file.type) && !hasSupportedImageExtension(file.name)) {
    throw new Error('Unsupported image type');
  }
}

export async function preparePhotoFileForUpload(
  file: File,
  targetType: BulkPhotoTargetType
): Promise<File> {
  validateImageFile(file);
  const normalized = normalizeImageFile(file);
  if (targetType === 'project-progress-note' || targetType === 'coloring-page-progress-note') {
    return compressProgressImage(normalized);
  }
  return compressProjectImage(normalized);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

function isCoverTarget(targetType: BulkPhotoTargetType | undefined): boolean {
  return targetType === 'project-cover' || targetType === 'coloring-book-cover';
}

interface TargetIndex {
  projects: Set<string>;
  books: Set<string>;
  pages: Set<string>;
  covers: Set<string>;
}

function coverKey(row: BulkPhotoReviewRow): string {
  return `${row.targetType}:${row.targetId}`;
}

function targetExists(row: BulkPhotoReviewRow, targets: TargetIndex): boolean {
  if (!row.targetType || !row.targetId) return false;
  const kind = kindForTargetType(row.targetType);
  if (kind === 'project') return targets.projects.has(row.targetId);
  if (kind === 'coloring-book') return targets.books.has(row.targetId);
  return targets.pages.has(row.targetId);
}

function groupRowsByTarget(
  rows: BulkPhotoReviewRow[],
  key: (row: BulkPhotoReviewRow) => string
): BulkPhotoReviewRow[][] {
  const groups = new Map<string, BulkPhotoReviewRow[]>();

  rows.forEach(row => {
    const targetKey = key(row);
    const group = groups.get(targetKey) ?? [];
    group.push(row);
    groups.set(targetKey, group);
  });

  return Array.from(groups.values());
}

export async function importBulkPhotos(
  rows: BulkPhotoReviewRow[],
  library: BulkPhotoLibrary,
  options: ImportBulkPhotosOptions = {}
): Promise<BulkPhotoImportResult> {
  const adapter = options.adapter ?? getDefaultAdapter();
  const selectedRows = rows.filter(
    row => row.confirmed && !row.excluded && row.targetId && row.targetType
  );
  const result: BulkPhotoImportResult = {
    importedCount: 0,
    skippedCount: rows.length - selectedRows.length,
    failedCount: 0,
    createdProgressNoteCount: 0,
    overwriteCount: 0,
    errors: [],
  };

  const pagePhotoState = new Map(library.coloringPages.map(page => [page.id, [...page.photos]]));
  const targets: TargetIndex = {
    projects: new Set(library.diamondProjects.map(project => project.id)),
    books: new Set(library.coloringBooks.map(book => book.id)),
    pages: new Set(library.coloringPages.map(page => page.id)),
    covers: new Set([
      ...library.diamondProjects
        .filter(project => Boolean(project.imageUrl))
        .map(project => `project-cover:${project.id}`),
      ...library.coloringBooks
        .filter(book => Boolean(book.coverImage))
        .map(book => `coloring-book-cover:${book.id}`),
    ]),
  };

  const importRow = async (row: BulkPhotoReviewRow) => {
    try {
      if (!row.targetType || !row.targetId) {
        result.skippedCount += 1;
        return;
      }

      if (!targetExists(row, targets)) {
        throw new Error('Selected target does not exist for its target type');
      }

      if (isCoverTarget(row.targetType) && targets.covers.has(coverKey(row)) && !row.overwrite) {
        result.skippedCount += 1;
        return;
      }

      const file = await preparePhotoFileForUpload(row.file, row.targetType);
      const date = row.date || lastModifiedDate(row.file);
      const note = row.note || DEFAULT_PROGRESS_NOTE_BODY;

      switch (row.targetType) {
        case 'project-cover':
          await adapter.updateProjectCover(row.targetId, file);
          targets.covers.add(coverKey(row));
          result.importedCount += 1;
          if (row.overwrite) result.overwriteCount += 1;
          break;
        case 'project-progress-note':
          await adapter.createProjectProgressNote(row.targetId, file, date, note);
          result.importedCount += 1;
          result.createdProgressNoteCount += 1;
          break;
        case 'coloring-book-cover':
          await adapter.updateColoringBookCover(row.targetId, file);
          targets.covers.add(coverKey(row));
          result.importedCount += 1;
          if (row.overwrite) result.overwriteCount += 1;
          break;
        case 'coloring-page-photo': {
          const currentPhotos = pagePhotoState.get(row.targetId) ?? [];
          if (currentPhotos.length >= COLORING_PAGE_PHOTO_LIMIT) {
            result.skippedCount += 1;
            result.errors.push({
              path: row.path,
              message: 'Coloring page already has 99 photos',
            });
            return;
          }
          const updatedPage = await adapter.appendColoringPagePhoto(
            row.targetId,
            file,
            currentPhotos
          );
          pagePhotoState.set(row.targetId, updatedPage.photos);
          result.importedCount += 1;
          break;
        }
        case 'coloring-page-progress-note':
          await adapter.createColoringPageProgressNote(row.targetId, file, date, note);
          result.importedCount += 1;
          result.createdProgressNoteCount += 1;
          break;
      }
    } catch (error) {
      result.failedCount += 1;
      captureImportExportException(error, {
        source: 'bulk_photo_import',
        operation: 'import_photo',
        status: result.importedCount > 0 ? 'partial' : 'failed',
        failed_count: result.failedCount,
      });
      result.errors.push({
        path: row.path,
        message: error instanceof Error ? error.message : 'Photo import failed',
      });
    }
  };

  const coloringPagePhotoRows = selectedRows.filter(
    row => row.targetType === 'coloring-page-photo' && row.targetId
  );
  const otherRows = selectedRows.filter(
    row =>
      (!isCoverTarget(row.targetType) && row.targetType !== 'coloring-page-photo') || !row.targetId
  );
  const coverRows = selectedRows.filter(row => isCoverTarget(row.targetType) && row.targetId);
  const importGroup = async (group: BulkPhotoReviewRow[]) => {
    for (const row of group) {
      await importRow(row);
    }
  };

  await Promise.all([
    runWithConcurrency(otherRows, options.concurrency ?? 2, importRow),
    runWithConcurrency(
      groupRowsByTarget(coloringPagePhotoRows, row => row.targetId!),
      options.concurrency ?? 2,
      importGroup
    ),
    runWithConcurrency(
      groupRowsByTarget(coverRows, coverKey),
      options.concurrency ?? 2,
      importGroup
    ),
  ]);

  return result;
}
