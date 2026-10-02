import { hasColorReferenceContent } from '@/schemas/colorReferenceSchema';
import {
  ColorReferencesService,
  type ColorReference,
} from '@/services/pocketbase/colorReferences.service';
import JSZip from 'jszip';
import {
  assertArchiveManifestRecordLimits,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_BYTES,
} from '@/features/import-export/archive/archiveImportLimits';
import { MAX_ARCHIVE_MANIFEST_BYTES } from '@/features/import-export/archive/archiveZipRead';

import { Collections } from '@/types/pocketbase.types';
import type { Project } from '@/types/project';
import { getCurrentUser, isAuthenticated } from '@/services/auth';
import { ArchiveFilesService } from '@/services/pocketbase/archiveFiles.service';
import { projectsService } from '@/services/pocketbase/projects.service';
import {
  ProgressNotesService,
  type ProgressNoteListItem,
} from '@/services/pocketbase/progressNotes.service';
import {
  ColoringService,
  type ColoringBookDTO,
  type ColoringPageDTO,
} from '@/services/pocketbase/coloring.service';
import {
  ColoringPageProgressNotesService,
  type ColoringPageProgressNoteListItem,
} from '@/services/pocketbase/coloringPageProgressNotes.service';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';
import {
  buildColoringPageCsvRows,
  coloringBooksToCsv,
  coloringPagesToCsv,
  COLORING_BOOK_METADATA_EXPAND,
  projectsToCsv,
} from '@/utils/csv/csvExport';
import type {
  ArchiveColoringBook,
  ArchiveColoringMedium,
  ArchiveColoringPage,
  ArchiveDiamondProject,
  ArchiveFileEntry,
  ArchiveWarning,
  OrganizedGlitterArchiveManifestV1,
} from '@/features/import-export/archive/types';
import { fetchPocketBaseFile } from '@/features/import-export/archive/fileFetch';
import { createFileTokenSession } from '@/features/import-export/archive/fileTokenSession';
import { captureImportExportException } from '@/features/import-export/importExportTelemetry';
import { IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES } from '@/features/import-export/importExportFileLimits';
import { toDateOnly } from '@/features/import-export/dateOnly';
import { mapWithConcurrency } from '@/services/pocketbase/base/mapWithConcurrency';

// Bounded parallelism for archive file downloads. Fetching sequentially made large exports
// (e.g. color-reference swatches, which can add up to 100 files/page) cliff at documented limits.
const ARCHIVE_EXPORT_FETCH_CONCURRENCY = 6;

function addRestorableEntry(zip: JSZip, path: string, content: string | Blob): void {
  const byteLength =
    typeof content === 'string' ? new TextEncoder().encode(content).byteLength : content.size;
  if (byteLength > MAX_ARCHIVE_ENTRY_BYTES) {
    throw new Error(`Archive entry ${path} is too large to restore`);
  }
  zip.file(path, content, { createFolders: false });
}

export interface ArchiveExportSourceData {
  colorReferences?: ColorReference[];
  projects: Project[];
  projectProgressNotes: ProgressNoteListItem[];
  coloringBooks: ColoringBookDTO[];
  coloringPagesByBookId: Record<string, ColoringPageDTO[]>;
  coloringMediums: ColoringMediumRecord[];
  coloringPageProgressNotes: ColoringPageProgressNoteListItem[];
}

export interface CreateArchiveZipOptions {
  exportedAt?: string;
  appVersion?: string;
  fetchImpl?: typeof fetch;
  fileToken?: string;
  maxArchiveBytes?: number;
  onProgress?: (progress: number) => void;
}

function getExtension(filename: string): string {
  return filename.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() || 'jpg';
}

function fileEntry(entry: ArchiveFileEntry): ArchiveFileEntry {
  return entry;
}

function makeProjectCoverPath(projectId: string, filename: string): string {
  return `photos/projects/${projectId}/cover.${getExtension(filename)}`;
}

function makeProjectNotePath(projectId: string, noteId: string, filename: string): string {
  return `photos/projects/${projectId}/progress-notes/${noteId}.${getExtension(filename)}`;
}

function makeColoringBookCoverPath(bookId: string, filename: string): string {
  return `photos/coloring-books/${bookId}/cover.${getExtension(filename)}`;
}

function makeColoringPagePhotoPath(
  bookId: string,
  pageNumber: number,
  index: number,
  filename: string
): string {
  return `photos/coloring-books/${bookId}/pages/${pageNumber}/${index}.${getExtension(filename)}`;
}

function makeColoringPageNotePath(
  bookId: string,
  pageNumber: number,
  noteId: string,
  filename: string
): string {
  return `photos/coloring-books/${bookId}/pages/${pageNumber}/progress-notes/${noteId}.${getExtension(
    filename
  )}`;
}

function createArchiveManifestFromData(
  data: ArchiveExportSourceData,
  exportedAt: string,
  appVersion?: string
): OrganizedGlitterArchiveManifestV1 {
  const files: ArchiveFileEntry[] = [];
  const notesByProject = new Map<string, ProgressNoteListItem[]>();
  const referencesByPage = new Map(
    data.colorReferences?.map(reference => [reference.page, reference])
  );
  const coloringNotesByPage = new Map<string, ColoringPageProgressNoteListItem[]>();

  data.projectProgressNotes.forEach(note => {
    const notes = notesByProject.get(note.projectId) ?? [];
    notes.push(note);
    notesByProject.set(note.projectId, notes);
  });

  data.coloringPageProgressNotes.forEach(note => {
    const notes = coloringNotesByPage.get(note.pageId) ?? [];
    notes.push(note);
    coloringNotesByPage.set(note.pageId, notes);
  });

  const coloringMediumById = new Map(data.coloringMediums.map(medium => [medium.id, medium]));
  const coloringMediums: ArchiveColoringMedium[] = data.coloringMediums.map(medium => ({
    ref: `coloring-medium:${medium.id}`,
    oldId: medium.id,
    name: medium.name,
    type: medium.type,
    brand: medium.brand,
    colorCount: medium.colorCount,
    notes: medium.notes,
  }));

  const diamondProjects: ArchiveDiamondProject[] = data.projects.map(project => {
    const projectRef = `project:${project.id}` as const;
    const coverPhotoPath = project.imageUrl
      ? makeProjectCoverPath(project.id, project.imageUrl)
      : undefined;

    if (coverPhotoPath && project.imageUrl) {
      files.push(
        fileEntry({
          path: coverPhotoPath,
          role: 'project-cover',
          recordRef: projectRef,
          field: 'image',
          originalFilename: project.imageUrl,
        })
      );
    }

    const progressNotes = (notesByProject.get(project.id) ?? []).map(note => {
      const noteRef = `project-note:${note.id}` as const;
      const imagePath = note.imageFilename
        ? makeProjectNotePath(project.id, note.id, note.imageFilename)
        : undefined;

      if (imagePath && note.imageFilename) {
        files.push(
          fileEntry({
            path: imagePath,
            role: 'project-progress-note',
            recordRef: noteRef,
            field: 'image',
            originalFilename: note.imageFilename,
          })
        );
      }

      return {
        ref: noteRef,
        oldId: note.id,
        content: note.content,
        date: note.date,
        imagePath,
      };
    });

    return {
      ref: projectRef,
      oldId: project.id,
      title: project.title,
      company: project.company,
      artist: project.artist,
      status: project.status,
      kitCategory: project.kitCategory,
      drillShape: project.drillShape,
      width: project.width,
      height: project.height,
      totalDiamonds: project.totalDiamonds,
      colorCount: project.colorCount,
      datePurchased: project.datePurchased,
      dateReceived: project.dateReceived,
      dateStarted: project.dateStarted,
      dateCompleted: project.dateCompleted,
      generalNotes: project.generalNotes,
      sourceUrl: project.sourceUrl,
      tags: project.tags?.map(tag => tag.name) ?? [],
      coverPhotoPath,
      progressNotes,
    };
  });

  const coloringBooks: ArchiveColoringBook[] = data.coloringBooks.map(book => {
    const bookRef = `coloring-book:${book.id}` as const;
    const coverPhotoPath = book.coverImage
      ? makeColoringBookCoverPath(book.id, book.coverImage)
      : undefined;

    if (coverPhotoPath && book.coverImage) {
      files.push(
        fileEntry({
          path: coverPhotoPath,
          role: 'coloring-book-cover',
          recordRef: bookRef,
          field: 'cover_image',
          originalFilename: book.coverImage,
        })
      );
    }

    const pages: ArchiveColoringPage[] = (data.coloringPagesByBookId[book.id] ?? []).map(page => {
      const reference = referencesByPage.get(page.id);
      const colorReference =
        reference && hasColorReferenceContent(reference)
          ? {
              ref: `coloring-color-reference:${reference.id}` as const,
              notes: reference.notes,
              photoPaths: reference.photos.map((filename, index) => {
                const path = `photos/coloring-books/${book.id}/pages/${page.pageNumber}/swatches/${index + 1}.${getExtension(filename)}`;
                files.push(
                  fileEntry({
                    path,
                    role: 'coloring-swatch-photo',
                    recordRef: `coloring-color-reference:${reference.id}`,
                    field: 'photos',
                    originalFilename: filename,
                  })
                );
                return path;
              }),
            }
          : undefined;
      const pageRef = `coloring-page:${page.id}` as const;
      const photoPaths = page.photos.map((photo, index) => {
        const path = makeColoringPagePhotoPath(book.id, page.pageNumber, index + 1, photo);
        files.push(
          fileEntry({
            path,
            role: 'coloring-page-photo',
            recordRef: pageRef,
            field: 'photos',
            originalFilename: photo,
          })
        );
        return path;
      });

      const progressNotes = (coloringNotesByPage.get(page.id) ?? []).map(note => {
        const noteRef = `coloring-page-note:${note.id}` as const;
        const imagePath = note.imageFilename
          ? makeColoringPageNotePath(book.id, page.pageNumber, note.id, note.imageFilename)
          : undefined;

        if (imagePath && note.imageFilename) {
          files.push(
            fileEntry({
              path: imagePath,
              role: 'coloring-page-progress-note',
              recordRef: noteRef,
              field: 'image',
              originalFilename: note.imageFilename,
            })
          );
        }

        return {
          ref: noteRef,
          oldId: note.id,
          content: note.content,
          date: note.date,
          imagePath,
        };
      });

      return {
        ref: pageRef,
        oldId: page.id,
        pageNumber: page.pageNumber,
        status: page.status,
        mediumRefs: page.mediumIds
          .filter(mediumId => coloringMediumById.has(mediumId))
          .map(mediumId => `coloring-medium:${mediumId}` as const),
        revealedSubject: page.revealedSubject,
        revealedAt: page.revealedAt,
        startedAt: page.startedAt,
        completedAt: page.completedAt,
        photoPaths,
        colorReference,
        progressNotes,
      };
    });

    return {
      ref: bookRef,
      oldId: book.id,
      title: book.title,
      publisher: book.publisherName,
      illustrator: book.illustratorName,
      series: book.series,
      theme: book.theme,
      isbn: book.isbn,
      publicationYear: book.publicationYear,
      edition: book.edition,
      language: book.language,
      sourceUrl: book.sourceUrl,
      datePurchased: book.datePurchased,
      dateReceived: book.dateReceived,
      dateStarted: book.dateStarted,
      dateCompleted: book.dateCompleted,
      bookFormat: book.bookFormat,
      notes: book.notes,
      isMystery: book.isMystery,
      status: book.status,
      totalPages: book.totalPages,
      completedPages: book.completedPages,
      completionPercentage: book.completionPercentage,
      lastActivityAt: book.lastActivityAt,
      tags: book.tags?.map(tag => tag.name) ?? [],
      coverPhotoPath,
      pages,
    };
  });

  return {
    schemaVersion: 2,
    exportedAt,
    appVersion,
    source: 'organized-glitter',
    files,
    diamondProjects,
    coloringMediums,
    coloringBooks,
    warnings: [],
  };
}

export async function createArchiveZipFromData(
  data: ArchiveExportSourceData,
  options: CreateArchiveZipOptions = {}
): Promise<{
  blob: Blob;
  manifest: OrganizedGlitterArchiveManifestV1;
  warnings: ArchiveWarning[];
}> {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const manifest = createArchiveManifestFromData(data, exportedAt, options.appVersion);
  assertArchiveManifestRecordLimits(manifest);
  if (manifest.files.length + 4 > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Archive contains too many entries to restore');
  }
  const zip = new JSZip();
  const warnings: ArchiveWarning[] = [];

  addRestorableEntry(zip, 'diamond-projects.csv', projectsToCsv(data.projects));
  addRestorableEntry(zip, 'coloring-books.csv', coloringBooksToCsv(data.coloringBooks));
  addRestorableEntry(
    zip,
    'coloring-pages.csv',
    coloringPagesToCsv(
      buildColoringPageCsvRows({
        books: data.coloringBooks,
        pagesByBookId: data.coloringPagesByBookId,
        coloringMediums: data.coloringMediums,
        coloringPageProgressNotes: data.coloringPageProgressNotes,
      })
    )
  );

  const totalFiles = manifest.files.length;
  let processedFiles = 0;
  let fileToken = totalFiles > 0 ? options.fileToken : undefined;
  const maxArchiveBytes = options.maxArchiveBytes ?? IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES;

  if (totalFiles > 0 && !fileToken) {
    try {
      fileToken = await ArchiveFilesService.getPrivateFileToken();
    } catch (error) {
      captureImportExportException(error, {
        source: 'archive_export',
        operation: 'get_private_file_token',
        archive_schema_version: manifest.schemaVersion,
        status: 'failed',
      });
      throw new Error('Could not request a private file token for archive export', {
        cause: error,
      });
    }
  }

  if (totalFiles > 0 && !fileToken) {
    const error = new Error('Could not request a private file token for archive export');
    captureImportExportException(error, {
      source: 'archive_export',
      operation: 'get_private_file_token',
      archive_schema_version: manifest.schemaVersion,
      status: 'failed',
    });
    throw error;
  }

  const tokenSession = fileToken ? createFileTokenSession(fileToken) : null;

  await mapWithConcurrency(manifest.files, ARCHIVE_EXPORT_FETCH_CONCURRENCY, async entry => {
    const [collectionName, recordId, filename] =
      entry.role === 'coloring-swatch-photo'
        ? [
            Collections.ColoringPageColorReferences,
            entry.recordRef.replace('coloring-color-reference:', ''),
            entry.originalFilename,
          ]
        : entry.role === 'project-cover'
          ? [Collections.Projects, entry.recordRef.replace('project:', ''), entry.originalFilename]
          : entry.role === 'project-progress-note'
            ? [
                Collections.ProgressNotes,
                entry.recordRef.replace('project-note:', ''),
                entry.originalFilename,
              ]
            : entry.role === 'coloring-book-cover'
              ? [
                  Collections.ColoringBooks,
                  entry.recordRef.replace('coloring-book:', ''),
                  entry.originalFilename,
                ]
              : entry.role === 'coloring-page-photo'
                ? [
                    Collections.ColoringPages,
                    entry.recordRef.replace('coloring-page:', ''),
                    entry.originalFilename,
                  ]
                : [
                    Collections.ColoringPageProgressNotes,
                    entry.recordRef.replace('coloring-page-note:', ''),
                    entry.originalFilename,
                  ];

    if (!filename) return;

    const result = await fetchPocketBaseFile(
      {
        collectionName,
        recordId,
        filename,
        entry,
        fileToken: tokenSession ? await tokenSession.current() : undefined,
        refreshFileToken: tokenSession ? () => tokenSession.refresh() : undefined,
      },
      options.fetchImpl
    );

    if (result.blob) {
      addRestorableEntry(zip, entry.path, result.blob);
    }

    if (result.warning) {
      warnings.push(result.warning);
    }

    processedFiles += 1;
    options.onProgress?.(totalFiles === 0 ? 90 : Math.round((processedFiles / totalFiles) * 90));
  });

  manifest.warnings = warnings;
  const manifestJson = JSON.stringify(manifest, null, 2);
  if (new TextEncoder().encode(manifestJson).byteLength > MAX_ARCHIVE_MANIFEST_BYTES) {
    throw new Error('Archive manifest is too large to restore');
  }
  addRestorableEntry(zip, 'manifest.json', manifestJson);
  options.onProgress?.(100);

  const blob = await zip.generateAsync({ type: 'blob' });
  if (blob.size > maxArchiveBytes) {
    throw new Error(
      `Archive is ${blob.size} bytes and exceeds the maximum archive size of ${maxArchiveBytes} bytes`
    );
  }

  return {
    blob,
    manifest,
    warnings,
  };
}

export async function loadArchiveExportSourceData(): Promise<ArchiveExportSourceData> {
  if (!isAuthenticated()) {
    throw new Error('You must be logged in to export an archive');
  }

  const user = getCurrentUser();
  if (!user?.id) {
    throw new Error('You must be logged in to export an archive');
  }

  const [
    projects,
    projectProgressNotesResult,
    coloringBooks,
    coloringMediumsResult,
    coloringPageProgressNotes,
    colorReferences,
  ] = await Promise.all([
    projectsService.getAllForUser(user.id),
    ProgressNotesService.listAllForUser({ userId: user.id }),
    ColoringService.listAllBooks({
      userId: user.id,
      expand: COLORING_BOOK_METADATA_EXPAND,
    }),
    ColoringMediumsService.listColoringMediums(user.id),
    ColoringPageProgressNotesService.listAllForUser({ userId: user.id }),
    ColorReferencesService.list(user.id),
  ]);

  const coloringPagesByBookId = await ColoringService.listAllPagesByBook(
    user.id,
    coloringBooks.map(book => book.id)
  );

  return {
    projects,
    projectProgressNotes: projectProgressNotesResult,
    coloringBooks,
    coloringPagesByBookId,
    coloringMediums: coloringMediumsResult.items,
    coloringPageProgressNotes,
    colorReferences,
  };
}

function stableSourceSnapshot(value: unknown): string {
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      const items = value.map(normalize);
      if (
        items.every(
          item =>
            item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
        )
      ) {
        return items.sort((left, right) =>
          String((left as { id: string }).id).localeCompare(String((right as { id: string }).id))
        );
      }
      return items;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)])
      );
    }
    return value;
  }

  return JSON.stringify(normalize(value));
}

function getArchiveExportFilename(date: Date = new Date()): string {
  return `organized-glitter-export-${toDateOnly(date)}.zip`;
}

export async function exportArchiveZip(options: CreateArchiveZipOptions = {}): Promise<{
  blob: Blob;
  filename: string;
  warnings: ArchiveWarning[];
  archiveSchemaVersion: OrganizedGlitterArchiveManifestV1['schemaVersion'];
}> {
  let data: ArchiveExportSourceData;
  const sourceUserId = getCurrentUser()?.id;
  try {
    data = await loadArchiveExportSourceData();
  } catch (error) {
    captureImportExportException(error, {
      source: 'archive_export',
      operation: 'load_export_source',
      status: 'failed',
    });
    throw error;
  }

  const { blob, manifest, warnings } = await createArchiveZipFromData(data, {
    appVersion: import.meta.env.VITE_APP_VERSION,
    ...options,
    onProgress: progress => options.onProgress?.(Math.min(progress, 99)),
  });

  const currentData = await loadArchiveExportSourceData();
  if (
    getCurrentUser()?.id !== sourceUserId ||
    stableSourceSnapshot(data) !== stableSourceSnapshot(currentData)
  ) {
    throw new Error('Archive source records changed during export. Retry after edits stop.');
  }
  options.onProgress?.(100);

  return {
    blob,
    filename: getArchiveExportFilename(new Date(options.exportedAt ?? Date.now())),
    warnings,
    archiveSchemaVersion: manifest.schemaVersion,
  };
}
