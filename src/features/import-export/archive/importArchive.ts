import {
  ColorReferencesService,
  type ColorReferenceRestoreResult,
} from '@/services/pocketbase/colorReferences.service';
import { normalizeImageFile } from '@/utils/image/imagePolicy';
import JSZip from 'jszip';

import type { MarkdownString } from '@/types/markdown';
import { getCurrentUser, isAuthenticated } from '@/services/auth';
import { CompaniesService } from '@/services/pocketbase/companies.service';
import { ArtistsService } from '@/services/pocketbase/artists.service';
import { projectsService } from '@/services/pocketbase/projects.service';
import { TagService } from '@/services/pocketbase/tags.service';
import { ProgressNotesService } from '@/services/pocketbase/progressNotes.service';
import {
  ColoringService,
  type ColoringBookDTO,
  type ColoringPageDTO,
} from '@/services/pocketbase/coloring.service';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import { BookPublishersService } from '@/services/pocketbase/bookPublishers.service';
import { BookIllustratorsService } from '@/services/pocketbase/bookIllustrators.service';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';
import { ArchiveFilesService } from '@/services/pocketbase/archiveFiles.service';
import { TAG_COLOR_PALETTE } from '@/utils/ui/tagColors';
import { isServiceResponseError, type ServiceResponse } from '@/types/shared';
import type { Tag, TagFormValues } from '@/types/tag';
import { preparePhotoFileForUpload } from '@/features/import-export/bulk-photos/bulkPhotoImport';
import {
  findMissingOptionalPhotoWarnings,
  validateArchiveManifest,
} from '@/features/import-export/archive/archiveManifest';
import { COLORING_BOOK_METADATA_EXPAND } from '@/utils/csv/csvExport';
import { assertImportExportZipWithinSizeLimit } from '@/features/import-export/importExportFileLimits';
import type { ColoringMediumRecord } from '@/types/coloringMedium';
import type {
  ArchiveColoringBook,
  ArchiveColoringMedium,
  ArchiveColoringPage,
  ArchiveDiamondProject,
  ArchiveImportResult,
  ArchiveWarning,
  OrganizedGlitterArchiveManifestV1,
} from '@/features/import-export/archive/types';
import { captureImportExportException } from '@/features/import-export/importExportTelemetry';
import {
  assertArchiveCentralDirectoryLimits,
  assertArchiveZipMetadataLimits,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_EXPANDED_BYTES,
} from '@/features/import-export/archive/archiveImportLimits';
import {
  readBoundedBlob,
  readBoundedText,
  MAX_ARCHIVE_MANIFEST_BYTES,
} from '@/features/import-export/archive/archiveZipRead';
import {
  coloringPageMetadataMatches,
  createArchiveImportRecoveryStore,
  deriveArchiveColoringBookId,
  fingerprintArchiveManifest,
  isPristineGeneratedColoringPage,
  snapshotArchivedColoringPage,
  snapshotCurrentColoringPage,
  type ArchiveImportRecoveryStore,
  type ColoringBookRecoveryCheckpoint,
  type ColoringPageMetadataSnapshot,
} from '@/features/import-export/archive/archiveImportRecovery';

const DEFAULT_TAG_COLOR_HEX = TAG_COLOR_PALETTE[0].hex;
const ARCHIVE_PAGE_PHOTO_BATCH_SIZE = 4;
const archiveImportQueues = new Map<string, Promise<unknown>>();
const AMBIGUOUS_PROJECT_MATCH = Symbol('ambiguous-project-match');

export function withArchiveImportLock<T>(
  name: string,
  work: () => Promise<T>,
  lockManager: LockManager | null = typeof navigator !== 'undefined' ? navigator.locks : null
): Promise<T> {
  if (lockManager) {
    return lockManager.request(name, work);
  }

  const prior = archiveImportQueues.get(name) ?? Promise.resolve();
  const queued = prior
    .catch(() => undefined)
    .then(work)
    .finally(() => {
      if (archiveImportQueues.get(name) === queued) archiveImportQueues.delete(name);
    });
  archiveImportQueues.set(name, queued);
  return queued;
}

export class PartialColorReferenceRestoreError extends Error {
  readonly addedPhotoCount: number;
  readonly referenceId: string;

  constructor(
    message: string,
    options: { addedPhotoCount: number; referenceId: string; cause?: unknown }
  ) {
    super(message, { cause: options.cause });
    this.name = 'PartialColorReferenceRestoreError';
    this.addedPhotoCount = options.addedPhotoCount;
    this.referenceId = options.referenceId;
  }
}

export async function restoreArchivedColorReference(
  pageId: string,
  userId: string,
  notes: string,
  photoPaths: string[],
  loadPhoto: (path: string) => Promise<File>,
  restoreKey: string
): Promise<ColorReferenceRestoreResult> {
  let referenceId = '';
  let addedPhotoCount = 0;
  try {
    for (let offset = 0; offset < Math.max(photoPaths.length, 1); offset++) {
      const path = photoPaths[offset];
      const files = path ? [await loadPhoto(path)] : [];
      const restored = await ColorReferencesService.restore(pageId, userId, {
        action: 'restore',
        notes,
        files,
        restoreKey,
        restoreOffset: offset,
      });
      referenceId = restored.referenceId;
      addedPhotoCount += restored.addedPhotoCount;
    }
    return { referenceId, addedPhotoCount };
  } catch (error) {
    throw new PartialColorReferenceRestoreError(
      error instanceof Error ? error.message : 'Color reference restore failed',
      { addedPhotoCount, referenceId, cause: error }
    );
  }
}

function applyColorReferenceRestoreProgress(
  result: ArchiveImportResult,
  referenceRef: NonNullable<ArchiveColoringPage['colorReference']>['ref'],
  restored: { referenceId: string; addedPhotoCount: number }
) {
  if (restored.referenceId) {
    result.refMap[referenceRef] = restored.referenceId;
  }
  result.importedPhotoCount += restored.addedPhotoCount;
}

export interface ArchiveBundle {
  zip: JSZip;
  manifest: OrganizedGlitterArchiveManifestV1;
  warnings: ArchiveWarning[];
  archiveFingerprint?: string;
}

export interface ArchiveImportAdapter {
  restoreColorReference?(
    pageId: string,
    notes: string,
    photoPaths: string[],
    loadPhoto: (path: string) => Promise<File>,
    restoreKey: string
  ): Promise<ColorReferenceRestoreResult>;
  listExistingProjects(): Promise<Array<{ id: string; title: string; sourceUrl?: string }>>;
  createDiamondProject(
    project: ArchiveDiamondProject,
    coverFile?: File,
    archiveProjectId?: string
  ): Promise<{ id: string }>;
  addDiamondTags(projectId: string, tagNames: string[]): Promise<void>;
  listDiamondProgressNotes(
    projectId: string
  ): Promise<Array<{ content: string; date: string; imageFilename?: string }>>;
  createDiamondProgressNote(
    projectId: string,
    note: { content: string; date: string },
    imageFile?: File
  ): Promise<{ id: string } | void>;
  listExistingColoringBooks(): Promise<
    Array<{ id: string; title: string; publisher?: string; illustrator?: string; tags?: string[] }>
  >;
  createColoringBook(book: ArchiveColoringBook, coverFile?: File): Promise<ColoringBookDTO>;
  getArchiveColoringBookId?(
    archiveFingerprint: string,
    archiveBookRef: ArchiveColoringBook['ref']
  ): Promise<string>;
  restoreArchiveColoringBook?(
    book: ArchiveColoringBook,
    archiveFingerprint: string,
    coverFile: File | undefined,
    options: { allowCreate: boolean }
  ): Promise<{
    bookId: string;
    created: boolean;
    pages: ColoringPageDTO[];
  }>;
  addColoringBookTags(bookId: string, tagNames: string[]): Promise<void>;
  listColoringMediums(): Promise<ColoringMediumRecord[]>;
  createColoringMedium(medium: ArchiveColoringMedium): Promise<ColoringMediumRecord>;
  listColoringPages(bookId: string): Promise<ColoringPageDTO[]>;
  restoreColoringPageMetadata(input: {
    pageId: string;
    baseline: ColoringPageMetadataSnapshot;
    intended: ColoringPageMetadataSnapshot;
  }): Promise<void>;
  reconcileColoringBookMetrics?(bookId: string): Promise<void>;
  appendColoringPagePhotos(pageId: string, photoFiles: File[]): Promise<ColoringPageDTO>;
  listColoringPageProgressNotes(
    pageId: string
  ): Promise<Array<{ content: string; date: string; imageFilename?: string }>>;
  createColoringPageProgressNote(
    pageId: string,
    note: { content: string; date: string },
    imageFile?: File
  ): Promise<{ id: string } | void>;
}

function appendIfPresent(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  formData.append(key, String(value));
}

async function resolveCompanyId(name: string | undefined): Promise<string | undefined> {
  if (!name?.trim()) return undefined;
  const existing = await CompaniesService.findByName(name);
  return existing?.id ?? (await CompaniesService.create({ name })).id;
}

async function resolveArtistId(name: string | undefined): Promise<string | undefined> {
  if (!name?.trim()) return undefined;
  const existing = await ArtistsService.findByName(name);
  return existing?.id ?? (await ArtistsService.create({ name })).id;
}

async function createDiamondProjectRecord(
  project: ArchiveDiamondProject,
  coverFile?: File,
  archiveProjectId?: string
): Promise<{ id: string }> {
  const [companyId, artistId] = await Promise.all([
    resolveCompanyId(project.company),
    resolveArtistId(project.artist),
  ]);

  const formData = new FormData();
  appendIfPresent(formData, 'id', archiveProjectId);
  appendIfPresent(formData, 'title', project.title);
  appendIfPresent(formData, 'status', project.status);
  appendIfPresent(formData, 'kitCategory', project.kitCategory ?? 'full');
  appendIfPresent(formData, 'drillShape', project.drillShape);
  appendIfPresent(formData, 'width', project.width);
  appendIfPresent(formData, 'height', project.height);
  appendIfPresent(formData, 'totalDiamonds', project.totalDiamonds);
  appendIfPresent(formData, 'colorCount', project.colorCount);
  appendIfPresent(formData, 'datePurchased', project.datePurchased);
  appendIfPresent(formData, 'dateReceived', project.dateReceived);
  appendIfPresent(formData, 'dateStarted', project.dateStarted);
  appendIfPresent(formData, 'dateCompleted', project.dateCompleted);
  appendIfPresent(formData, 'generalNotes', project.generalNotes);
  appendIfPresent(formData, 'sourceUrl', project.sourceUrl);
  appendIfPresent(formData, 'company', companyId);
  appendIfPresent(formData, 'artist', artistId);
  if (coverFile) formData.append('image', coverFile);

  const restored = await ArchiveFilesService.restoreDiamondProject(formData);
  if (restored.status !== project.status) {
    throw new Error('Archive diamond project status changed during restore.');
  }
  return restored;
}

interface TagResolver {
  listTags: () => Promise<ServiceResponse<Tag[]>>;
  createTag: (tagData: TagFormValues) => Promise<ServiceResponse<Tag>>;
}

async function getOrCreateTagIds(tagNames: string[], resolver: TagResolver): Promise<string[]> {
  const existingResponse = await resolver.listTags();
  if (isServiceResponseError(existingResponse)) {
    throw existingResponse.error;
  }

  const byName = new Map(existingResponse.data.map(tag => [tag.name.toLowerCase(), tag.id]));
  const ids: string[] = [];

  for (const tagName of tagNames) {
    const trimmed = tagName.trim();
    if (!trimmed) continue;
    const existingId = byName.get(trimmed.toLowerCase());
    if (existingId) {
      ids.push(existingId);
      continue;
    }

    const created = await resolver.createTag({
      name: trimmed,
      color: DEFAULT_TAG_COLOR_HEX,
    });
    if (isServiceResponseError(created)) throw created.error;
    byName.set(trimmed.toLowerCase(), created.data.id);
    ids.push(created.data.id);
  }

  return ids;
}

function getOrCreateDiamondTagIds(tagNames: string[]): Promise<string[]> {
  return getOrCreateTagIds(tagNames, {
    listTags: () => TagService.getUserTags(),
    createTag: tagData => TagService.createTag(tagData),
  });
}

function getOrCreateColoringTagIds(tagNames: string[]): Promise<string[]> {
  return getOrCreateTagIds(tagNames, {
    listTags: () => ColoringTagService.listColoringTags(),
    createTag: tagData => ColoringTagService.createColoringTag(tagData),
  });
}

async function resolvePublisherId(name: string | undefined): Promise<string | undefined> {
  if (!name?.trim()) return undefined;
  return (await BookPublishersService.createIfNotExists({ name })).id;
}

async function resolveIllustratorId(name: string | undefined): Promise<string | undefined> {
  if (!name?.trim()) return undefined;
  return (await BookIllustratorsService.createIfNotExists({ name })).id;
}

function appendArchiveColoringBookIdentityFields(
  formData: FormData,
  book: ArchiveColoringBook,
  archiveFingerprint: string
): void {
  appendIfPresent(formData, 'archiveFingerprint', archiveFingerprint);
  appendIfPresent(formData, 'archiveBookRef', book.ref);
  appendIfPresent(formData, 'title', book.title);
  appendIfPresent(formData, 'totalPages', book.totalPages);
}

function appendArchiveColoringBookCreationFields(
  formData: FormData,
  book: ArchiveColoringBook,
  publisher?: string,
  illustrator?: string
): void {
  appendIfPresent(formData, 'publisher', publisher);
  appendIfPresent(formData, 'illustrator', illustrator);
  appendIfPresent(formData, 'series', book.series);
  appendIfPresent(formData, 'theme', book.theme);
  appendIfPresent(formData, 'isbn', book.isbn);
  appendIfPresent(formData, 'publicationYear', book.publicationYear);
  appendIfPresent(formData, 'edition', book.edition);
  appendIfPresent(formData, 'language', book.language);
  appendIfPresent(formData, 'sourceUrl', book.sourceUrl);
  appendIfPresent(formData, 'datePurchased', book.datePurchased);
  appendIfPresent(formData, 'dateReceived', book.dateReceived);
  appendIfPresent(formData, 'dateStarted', book.dateStarted);
  appendIfPresent(formData, 'dateCompleted', book.dateCompleted);
  appendIfPresent(formData, 'bookFormat', book.bookFormat);
  appendIfPresent(formData, 'notes', book.notes);
  appendIfPresent(formData, 'isMystery', book.isMystery);
  appendIfPresent(formData, 'status', book.status);
  appendIfPresent(formData, 'completedPages', book.completedPages);
  appendIfPresent(formData, 'completionPercentage', book.completionPercentage);
  appendIfPresent(formData, 'lastActivityAt', book.lastActivityAt);
}

async function restoreArchiveColoringBookRecord(
  book: ArchiveColoringBook,
  archiveFingerprint: string,
  coverFile: File | undefined,
  options: { allowCreate: boolean }
): Promise<{ bookId: string; created: boolean; pages: ColoringPageDTO[] }> {
  const [publisher, illustrator] = await Promise.all([
    resolvePublisherId(book.publisher),
    resolveIllustratorId(book.illustrator),
  ]);
  let bookId = '';
  let created = false;
  const pages: ColoringPageDTO[] = [];

  for (let firstPage = 1; firstPage <= book.totalPages; firstPage += 100) {
    const formData = new FormData();
    appendArchiveColoringBookIdentityFields(formData, book, archiveFingerprint);
    if (firstPage === 1) {
      appendArchiveColoringBookCreationFields(formData, book, publisher, illustrator);
    }
    appendIfPresent(formData, 'firstPage', firstPage);
    appendIfPresent(formData, 'pageCount', Math.min(100, book.totalPages - firstPage + 1));
    appendIfPresent(formData, 'allowCreate', options.allowCreate && firstPage === 1);
    if (firstPage === 1 && coverFile) formData.append('cover_image', coverFile);

    const batch = await ArchiveFilesService.restoreColoringBookBatch(formData);
    if (bookId && bookId !== batch.bookId) {
      throw new Error('Archive coloring book restore returned inconsistent record IDs.');
    }
    bookId = batch.bookId;
    created ||= batch.created;
    pages.push(...batch.pages);
  }

  return { bookId, created, pages };
}

function createDefaultArchiveImportAdapter(userId: string): ArchiveImportAdapter {
  return {
    async listExistingProjects() {
      return (await projectsService.getAllForUser(userId)).map(project => ({
        id: project.id,
        title: project.title,
        sourceUrl: project.sourceUrl,
      }));
    },
    createDiamondProject(project, coverFile, archiveProjectId) {
      return createDiamondProjectRecord(project, coverFile, archiveProjectId);
    },
    async addDiamondTags(projectId, tagNames) {
      const tagIds = await getOrCreateDiamondTagIds(tagNames);
      await Promise.all(
        tagIds.map(async tagId => {
          const response = await TagService.addTagToProject(projectId, tagId);
          if (isServiceResponseError(response)) throw response.error;
        })
      );
    },
    listDiamondProgressNotes(projectId) {
      return ProgressNotesService.listByProject(projectId);
    },
    async createDiamondProgressNote(projectId, note, imageFile) {
      return ProgressNotesService.create({
        project: projectId,
        content: note.content as MarkdownString,
        date: note.date,
        imageFile,
      });
    },
    async listExistingColoringBooks() {
      const books = await ColoringService.listAllBooks({
        userId,
        expand: COLORING_BOOK_METADATA_EXPAND,
      });
      return books.map(book => ({
        id: book.id,
        title: book.title,
        publisher: book.publisherName,
        illustrator: book.illustratorName,
        tags: book.tags?.map(tag => tag.name) ?? [],
      }));
    },
    async createColoringBook(book, coverFile) {
      const [publisher, illustrator] = await Promise.all([
        resolvePublisherId(book.publisher),
        resolveIllustratorId(book.illustrator),
      ]);
      return ColoringService.createBook({
        title: book.title,
        publisher,
        illustrator,
        series: book.series,
        theme: book.theme,
        isbn: book.isbn,
        publication_year: book.publicationYear,
        edition: book.edition,
        language: book.language || undefined,
        source_url: book.sourceUrl,
        date_purchased: book.datePurchased,
        date_received: book.dateReceived,
        date_started: book.dateStarted,
        date_completed: book.dateCompleted,
        book_format: book.bookFormat || undefined,
        notes: book.notes,
        cover_image: coverFile,
        is_mystery: book.isMystery,
        status: book.status,
        total_pages: book.totalPages,
        completed_pages: book.completedPages,
        completion_percentage: book.completionPercentage,
        last_activity_at: book.lastActivityAt,
      });
    },
    getArchiveColoringBookId(archiveFingerprint, archiveBookRef) {
      return deriveArchiveColoringBookId(userId, archiveFingerprint, archiveBookRef);
    },
    restoreArchiveColoringBook(book, archiveFingerprint, coverFile, options) {
      return restoreArchiveColoringBookRecord(book, archiveFingerprint, coverFile, options);
    },
    async addColoringBookTags(bookId, tagNames) {
      const tagIds = await getOrCreateColoringTagIds(tagNames);
      const response = await ColoringTagService.syncBookTags(bookId, tagIds);
      if (isServiceResponseError(response)) throw response.error;
    },
    async listColoringMediums() {
      return (await ColoringMediumsService.listColoringMediums(userId)).items;
    },
    createColoringMedium(medium) {
      return ColoringMediumsService.createColoringMedium({
        name: medium.name,
        type: medium.type,
        brand: medium.brand ?? '',
        colorCount: String(medium.colorCount ?? 0),
        notes: medium.notes ?? '',
      });
    },
    async listColoringPages(bookId) {
      return ColoringService.listAllPages({ bookId });
    },
    restoreColoringPageMetadata(input) {
      return ArchiveFilesService.restoreColoringPageMetadata(input);
    },
    reconcileColoringBookMetrics(bookId) {
      return ArchiveFilesService.reconcileColoringBookMetrics(bookId);
    },
    async restoreColorReference(pageId, notes, photoPaths, loadPhoto, restoreKey) {
      return restoreArchivedColorReference(
        pageId,
        userId,
        notes,
        photoPaths,
        loadPhoto,
        restoreKey
      );
    },
    appendColoringPagePhotos(pageId, photoFiles) {
      return ColoringService.updatePage(pageId, {
        'photos+': photoFiles,
      });
    },
    listColoringPageProgressNotes(pageId) {
      return ColoringPageProgressNotesService.listByPage(pageId);
    },
    async createColoringPageProgressNote(pageId, note, imageFile) {
      return ColoringPageProgressNotesService.create({
        page: pageId,
        content: note.content as MarkdownString,
        date: note.date,
        imageFile,
      });
    },
  };
}

function duplicateProjectKey(project: { title: string; sourceUrl?: string }): string {
  return `${project.title.normalize('NFC').trim().toLowerCase()}|${project.sourceUrl?.normalize('NFC').trim().toLowerCase() ?? ''}`;
}

function createArchiveProjectId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

function duplicateBookKey(book: {
  title: string;
  publisher?: string;
  illustrator?: string;
}): string {
  return `${book.title.trim().toLowerCase()}|${book.publisher?.trim().toLowerCase() ?? ''}|${
    book.illustrator?.trim().toLowerCase() ?? ''
  }`;
}

function progressNoteKey(note: {
  content: string;
  date: string;
  imageFilename?: string;
  imagePath?: string;
}): string {
  const hasImage = Boolean(note.imageFilename || note.imagePath);
  return `${note.date}|${note.content.trim()}|${hasImage ? 'image' : 'text'}`;
}

function coloringMediumKey(medium: { name: string }): string {
  return medium.name.trim().toLowerCase();
}

function isArchiveMetadataConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  return candidate.status === 409 || candidate.response?.status === 409;
}

async function resolveArchiveColoringMediums(
  archiveMediums: ArchiveColoringMedium[],
  adapter: ArchiveImportAdapter,
  warnings: ArchiveWarning[],
  refMap: ArchiveImportResult['refMap'],
  archiveSchemaVersion: OrganizedGlitterArchiveManifestV1['schemaVersion']
): Promise<Map<ArchiveColoringMedium['ref'], string>> {
  const existingMediums = await adapter.listColoringMediums();
  const existingByName = new Map(
    existingMediums.map(medium => [coloringMediumKey(medium), medium])
  );
  const mappedIds = new Map<ArchiveColoringMedium['ref'], string>();

  for (const medium of archiveMediums) {
    try {
      const existing = existingByName.get(coloringMediumKey(medium));
      const currentMedium = existing ?? (await adapter.createColoringMedium(medium));
      existingByName.set(coloringMediumKey(currentMedium), currentMedium);
      mappedIds.set(medium.ref, currentMedium.id);
      refMap[medium.ref] = currentMedium.id;
    } catch (error) {
      captureImportExportException(error, {
        source: 'archive_import',
        operation: 'map_coloring_medium',
        archive_schema_version: archiveSchemaVersion,
        status: 'partial',
        warning_count: warnings.length + 1,
      });
      warnings.push({
        code: 'coloring-medium-map-failed',
        message:
          error instanceof Error
            ? `Could not map coloring medium "${medium.name}": ${error.message}`
            : `Could not map coloring medium "${medium.name}"`,
        recordRef: medium.ref,
      });
    }
  }

  return mappedIds;
}

function getMappedPageMediumIds(
  page: ArchiveColoringPage,
  mediumIdsByRef: Map<ArchiveColoringMedium['ref'], string>,
  warnings: ArchiveWarning[]
): string[] {
  const mediumRefs = page.mediumRefs ?? [];

  if (mediumRefs.length > 0) {
    return mediumRefs.flatMap(ref => {
      const mediumId = mediumIdsByRef.get(ref);
      if (mediumId) return [mediumId];
      warnings.push({
        code: 'missing-coloring-medium',
        message: `Could not map coloring medium ${ref} for page ${page.pageNumber}`,
        recordRef: page.ref,
      });
      return [];
    });
  }

  if (page.mediumIds?.length) {
    warnings.push({
      code: 'legacy-coloring-medium-ids',
      message: `Archive page ${page.pageNumber} contains legacy coloring medium IDs that cannot be restored safely`,
      recordRef: page.ref,
    });
  }

  return [];
}

async function loadPhotoFile(
  zip: JSZip,
  path: string | undefined,
  targetType: Parameters<typeof preparePhotoFileForUpload>[1],
  warnings: ArchiveWarning[],
  extractionBudget: { expandedBytes: number }
): Promise<File | undefined> {
  if (!path) return undefined;
  const entry = zip.file(path);
  if (!entry) {
    warnings.push({
      code: 'missing-photo-file',
      message: `Archive photo is missing: ${path}`,
      path,
    });
    return undefined;
  }

  const blob = await readBoundedBlob(
    entry,
    MAX_ARCHIVE_ENTRY_BYTES,
    extractionBudget,
    MAX_ARCHIVE_EXPANDED_BYTES
  );
  const name = path.split('/').pop() ?? 'imported-photo.jpg';
  return preparePhotoFileForUpload(new File([blob], name, { type: blob.type }), targetType);
}

export async function readOrganizedGlitterArchive(file: File): Promise<ArchiveBundle> {
  try {
    assertImportExportZipWithinSizeLimit(file);
    await assertArchiveCentralDirectoryLimits(file);
    const zip = await JSZip.loadAsync(file);
    assertArchiveZipMetadataLimits(zip);
    const manifestEntry = zip.file('manifest.json');
    if (!manifestEntry) {
      throw new Error('Archive is missing manifest.json');
    }

    const manifestJson = await readBoundedText(manifestEntry, MAX_ARCHIVE_MANIFEST_BYTES);
    const manifest = validateArchiveManifest(JSON.parse(manifestJson));
    const availablePaths = new Set(Object.keys(zip.files).filter(path => !zip.files[path].dir));
    const warnings = findMissingOptionalPhotoWarnings(manifest, availablePaths);

    return {
      zip,
      manifest,
      warnings,
      archiveFingerprint: await fingerprintArchiveManifest(manifestJson),
    };
  } catch (error) {
    captureImportExportException(error, {
      source: 'archive_import',
      operation: 'read_archive_manifest',
      status: 'failed',
    });
    throw error;
  }
}

export async function importArchiveBundle(
  bundle: ArchiveBundle,
  adapter: ArchiveImportAdapter,
  recoveryStore?: ArchiveImportRecoveryStore
): Promise<ArchiveImportResult> {
  const extractionBudget = { expandedBytes: 0 };
  const warnings = [...bundle.warnings];
  const result: ArchiveImportResult = {
    success: true,
    createdProjectCount: 0,
    createdColoringBookCount: 0,
    createdProgressNoteCount: 0,
    importedPhotoCount: 0,
    skippedRecordCount: 0,
    skippedPagePhotoCount: 0,
    matchedExistingRecordCount: 0,
    archiveSchemaVersion: bundle.manifest.schemaVersion,
    refMap: {},
    warnings,
    errors: [],
  };

  const listedExistingProjects = await adapter.listExistingProjects();
  const existingProjectsById = new Map(
    listedExistingProjects.map(project => [project.id, project])
  );
  const existingProjects = new Map<
    string,
    Awaited<ReturnType<typeof adapter.listExistingProjects>>
  >();
  for (const existingProject of listedExistingProjects) {
    const key = duplicateProjectKey(existingProject);
    const bucket = existingProjects.get(key);
    if (bucket) bucket.push(existingProject);
    else existingProjects.set(key, [existingProject]);
  }
  const projectCheckpoints = new Map(
    bundle.manifest.diamondProjects.flatMap(project => {
      const checkpoint = recoveryStore?.getProject(project.ref);
      return checkpoint ? [[project.ref, checkpoint] as const] : [];
    })
  );
  const reservedArchiveProjectIds = new Set(
    Array.from(projectCheckpoints.values(), checkpoint => checkpoint.projectId)
  );
  const claimedExistingProjectIds = new Set<string>();
  const naturalProjectMatches = new Map<
    string,
    (typeof listedExistingProjects)[number] | typeof AMBIGUOUS_PROJECT_MATCH
  >();
  for (const [key, candidates] of existingProjects) {
    const eligibleCandidates = candidates.filter(
      candidate => !reservedArchiveProjectIds.has(candidate.id)
    );
    if (eligibleCandidates.length === 1) naturalProjectMatches.set(key, eligibleCandidates[0]);
    if (eligibleCandidates.length > 1) naturalProjectMatches.set(key, AMBIGUOUS_PROJECT_MATCH);
  }
  const existingBooksById = new Map<
    string,
    Awaited<ReturnType<typeof adapter.listExistingColoringBooks>>[number]
  >();
  const existingBooks = new Map<
    string,
    Awaited<ReturnType<typeof adapter.listExistingColoringBooks>>
  >();
  for (const existingBook of await adapter.listExistingColoringBooks()) {
    existingBooksById.set(existingBook.id, existingBook);
    const key = duplicateBookKey(existingBook);
    existingBooks.set(key, [...(existingBooks.get(key) ?? []), existingBook]);
  }
  const coloringMediumIdsByRef = await resolveArchiveColoringMediums(
    bundle.manifest.coloringMediums,
    adapter,
    warnings,
    result.refMap,
    result.archiveSchemaVersion
  );

  for (const project of bundle.manifest.diamondProjects) {
    try {
      const projectKey = duplicateProjectKey(project);
      let checkpoint = projectCheckpoints.get(project.ref);
      const archiveIdentityMatch = checkpoint
        ? existingProjectsById.get(checkpoint.projectId)
        : undefined;
      if (archiveIdentityMatch && duplicateProjectKey(archiveIdentityMatch) !== projectKey) {
        throw new Error(
          `Archive identity ${project.ref} for "${project.title}" conflicts with an existing diamond project. The records were not merged.`
        );
      }
      if (checkpoint?.creationConfirmed && !archiveIdentityMatch) {
        throw new Error(
          `Archive recovery target for ${project.ref} ("${project.title}") no longer exists. The record was not merged with another project.`
        );
      }

      const possibleNaturalMatch = checkpoint ? undefined : naturalProjectMatches.get(projectKey);
      if (possibleNaturalMatch === AMBIGUOUS_PROJECT_MATCH) {
        throw new Error(
          `Archive project ${project.ref} ("${project.title}") matches multiple existing diamond projects. None were merged.`
        );
      }
      const naturalKeyMatch =
        possibleNaturalMatch && !claimedExistingProjectIds.has(possibleNaturalMatch.id)
          ? possibleNaturalMatch
          : undefined;
      if (!checkpoint && naturalKeyMatch) {
        checkpoint = {
          projectId: naturalKeyMatch.id,
          isArchiveCreated: false,
          creationConfirmed: true,
          tagsRestored: true,
        };
        projectCheckpoints.set(project.ref, checkpoint);
        reservedArchiveProjectIds.add(checkpoint.projectId);
        recoveryStore?.saveProject(project.ref, checkpoint);
      }
      if (!checkpoint) {
        checkpoint = {
          projectId: recoveryStore ? createArchiveProjectId() : '',
          isArchiveCreated: true,
          creationConfirmed: false,
          tagsRestored: false,
        };
        projectCheckpoints.set(project.ref, checkpoint);
        if (checkpoint.projectId) reservedArchiveProjectIds.add(checkpoint.projectId);
        recoveryStore?.saveProject(project.ref, checkpoint);
      }

      const existingProject = archiveIdentityMatch ?? naturalKeyMatch;
      if (existingProject) {
        if (claimedExistingProjectIds.has(existingProject.id)) {
          throw new Error(
            `Archive project ${project.ref} ("${project.title}") conflicts with another archived project mapping. The records were not merged.`
          );
        }
        claimedExistingProjectIds.add(existingProject.id);
      }
      const coverFile = existingProject
        ? undefined
        : await loadPhotoFile(
            bundle.zip,
            project.coverPhotoPath,
            'project-cover',
            warnings,
            extractionBudget
          );
      const created = existingProject
        ? existingProject
        : await adapter.createDiamondProject(project, coverFile, checkpoint.projectId || undefined);
      if (checkpoint.projectId && created.id !== checkpoint.projectId) {
        throw new Error(`Archive project ${project.ref} was created with an unexpected identity.`);
      }
      const wasCreated = !existingProject;
      if (
        checkpoint.isArchiveCreated &&
        (!checkpoint.creationConfirmed || !checkpoint.projectId) &&
        (wasCreated || archiveIdentityMatch)
      ) {
        checkpoint = { ...checkpoint, projectId: created.id, creationConfirmed: true };
        projectCheckpoints.set(project.ref, checkpoint);
        recoveryStore?.saveProject(project.ref, checkpoint);
      }

      result.refMap[project.ref] = created.id;
      if (wasCreated) {
        result.createdProjectCount += 1;
        if (coverFile) result.importedPhotoCount += 1;
      } else {
        result.matchedExistingRecordCount += 1;
      }

      if (checkpoint.isArchiveCreated && !checkpoint.tagsRestored) {
        if (project.tags.length > 0) {
          await adapter.addDiamondTags(created.id, project.tags);
        }
        checkpoint = { ...checkpoint, tagsRestored: true };
        projectCheckpoints.set(project.ref, checkpoint);
        recoveryStore?.saveProject(project.ref, checkpoint);
      }

      if (project.progressNotes.length > 0) {
        const existingNoteKeys = new Set(
          (await adapter.listDiamondProgressNotes(created.id)).map(progressNoteKey)
        );
        for (const note of project.progressNotes) {
          const noteKey = progressNoteKey(note);
          if (existingNoteKeys.has(noteKey)) {
            result.skippedRecordCount += 1;
            continue;
          }

          const imageFile = await loadPhotoFile(
            bundle.zip,
            note.imagePath,
            'project-progress-note',
            warnings,
            extractionBudget
          );
          const createdNote = await adapter.createDiamondProgressNote(
            created.id,
            { content: note.content, date: note.date },
            imageFile
          );
          if (createdNote?.id) {
            result.refMap[note.ref] = createdNote.id;
          }
          result.createdProgressNoteCount += 1;
          if (imageFile) result.importedPhotoCount += 1;
          existingNoteKeys.add(noteKey);
        }
      }
    } catch (error) {
      captureImportExportException(error, {
        source: 'archive_import',
        operation: 'import_diamond_project',
        archive_schema_version: result.archiveSchemaVersion,
        status: 'partial',
        failed_count: result.errors.length + 1,
        warning_count: warnings.length,
      });
      result.errors.push(
        error instanceof Error ? error.message : `Could not import ${project.title}`
      );
    }
  }

  for (const book of bundle.manifest.coloringBooks) {
    const errorCountBeforeBook = result.errors.length;
    try {
      const archiveBookId =
        bundle.archiveFingerprint && adapter.getArchiveColoringBookId
          ? await adapter.getArchiveColoringBookId(bundle.archiveFingerprint, book.ref)
          : undefined;
      const naturalKeyMatches = existingBooks.get(duplicateBookKey(book)) ?? [];
      const duplicateBook =
        (archiveBookId ? existingBooksById.get(archiveBookId) : undefined) ??
        naturalKeyMatches.at(-1);
      let recoveryCheckpoint = recoveryStore?.getBook(book.ref);
      if (
        recoveryCheckpoint?.bookId &&
        archiveBookId &&
        recoveryCheckpoint.bookId !== archiveBookId
      ) {
        throw new Error('Archive recovery checkpoint does not match the archive book identity.');
      }
      const shouldUseArchiveRestore = Boolean(
        bundle.archiveFingerprint &&
        adapter.restoreArchiveColoringBook &&
        (recoveryCheckpoint || !duplicateBook || duplicateBook.id === archiveBookId)
      );
      const existingBook =
        duplicateBook && (!shouldUseArchiveRestore || duplicateBook.id === archiveBookId)
          ? duplicateBook
          : undefined;
      const coverFile =
        shouldUseArchiveRestore || !existingBook
          ? await loadPhotoFile(
              bundle.zip,
              book.coverPhotoPath,
              'coloring-book-cover',
              warnings,
              extractionBudget
            )
          : undefined;
      if (!existingBook && recoveryStore && !recoveryCheckpoint) {
        recoveryCheckpoint = { bookId: '', pages: {} };
        recoveryStore.saveBook(book.ref, recoveryCheckpoint);
      }

      const archiveRestore = shouldUseArchiveRestore
        ? await adapter.restoreArchiveColoringBook!(book, bundle.archiveFingerprint!, coverFile, {
            allowCreate:
              recoveryCheckpoint?.bookId === '' || (!recoveryCheckpoint && !duplicateBook),
          })
        : undefined;
      const createdBook = archiveRestore
        ? { id: archiveRestore.bookId, title: book.title }
        : existingBook
          ? existingBook
          : await adapter.createColoringBook(book, coverFile);
      const wasCreated = archiveRestore ? archiveRestore.created : !existingBook;

      if (recoveryStore && recoveryCheckpoint?.bookId === '' && !existingBook) {
        recoveryCheckpoint = { ...recoveryCheckpoint, bookId: createdBook.id };
        recoveryStore.saveBook(book.ref, recoveryCheckpoint);
      }

      result.refMap[book.ref] = createdBook.id;
      if (wasCreated) {
        result.createdColoringBookCount += 1;
        if (coverFile) result.importedPhotoCount += 1;
        const indexedBook = {
          id: createdBook.id,
          title: createdBook.title,
          publisher: book.publisher,
          illustrator: book.illustrator,
          tags: book.tags,
        };
        existingBooksById.set(createdBook.id, indexedBook);
        existingBooks.set(duplicateBookKey(book), [
          ...(existingBooks.get(duplicateBookKey(book)) ?? []),
          indexedBook,
        ]);
      } else {
        result.matchedExistingRecordCount += 1;
      }

      const pages = archiveRestore?.pages ?? (await adapter.listColoringPages(createdBook.id));
      const pagesByNumber = new Map(pages.map(page => [page.pageNumber, page]));
      const intendedMetadataByPageRef = new Map(
        book.pages.map(page => [
          page.ref,
          snapshotArchivedColoringPage(
            page,
            getMappedPageMediumIds(page, coloringMediumIdsByRef, warnings)
          ),
        ])
      );
      const hasArchiveProvenance = Boolean(
        shouldUseArchiveRestore || wasCreated || recoveryCheckpoint?.bookId === createdBook.id
      );
      if (hasArchiveProvenance) {
        const pageCheckpoints: ColoringBookRecoveryCheckpoint['pages'] = {
          ...(recoveryCheckpoint?.bookId === createdBook.id ? recoveryCheckpoint.pages : {}),
        };
        for (const page of book.pages) {
          const createdPage = pagesByNumber.get(page.pageNumber);
          const intended = intendedMetadataByPageRef.get(page.ref);
          if (!createdPage || !intended) continue;
          if (pageCheckpoints[page.ref]?.pageId === createdPage.id) continue;
          if (!isPristineGeneratedColoringPage(createdPage)) continue;
          pageCheckpoints[page.ref] = {
            pageId: createdPage.id,
            baseline: snapshotCurrentColoringPage(createdPage),
            intended,
          };
        }
        const newRecoveryCheckpoint: ColoringBookRecoveryCheckpoint = {
          bookId: createdBook.id,
          pages: pageCheckpoints,
        };
        recoveryCheckpoint = newRecoveryCheckpoint;
        recoveryStore?.saveBook(book.ref, newRecoveryCheckpoint);
      }

      await adapter.addColoringBookTags(
        createdBook.id,
        existingBook ? Array.from(new Set([...(existingBook.tags ?? []), ...book.tags])) : book.tags
      );

      for (const page of book.pages) {
        const createdPage = pagesByNumber.get(page.pageNumber);
        if (!createdPage) {
          warnings.push({
            code: 'missing-generated-page',
            message: `Could not find generated coloring page ${page.pageNumber}`,
            recordRef: page.ref,
          });
          continue;
        }

        result.refMap[page.ref] = createdPage.id;
        const intendedMetadata = intendedMetadataByPageRef.get(page.ref);
        if (!intendedMetadata) continue;
        const currentMetadata = snapshotCurrentColoringPage(createdPage);
        const pageCheckpoint =
          recoveryCheckpoint?.bookId === createdBook.id
            ? recoveryCheckpoint.pages[page.ref]
            : undefined;
        let metadataConflict = false;
        let metadataRestoreFailed = false;

        if (coloringPageMetadataMatches(currentMetadata, intendedMetadata)) {
          recoveryStore?.completePage(book.ref, page.ref);
        } else if (pageCheckpoint?.pageId === createdPage.id) {
          const baseline = pageCheckpoint.baseline;
          const checkpointIntended = pageCheckpoint.intended;
          if (!coloringPageMetadataMatches(checkpointIntended, intendedMetadata)) {
            metadataConflict = true;
          } else if (
            currentMetadata.updatedAt !== baseline.updatedAt ||
            !coloringPageMetadataMatches(currentMetadata, baseline)
          ) {
            metadataConflict = true;
          } else {
            try {
              await adapter.restoreColoringPageMetadata({
                pageId: createdPage.id,
                baseline,
                intended: intendedMetadata,
              });
              recoveryStore?.completePage(book.ref, page.ref);
            } catch (error) {
              captureImportExportException(error, {
                source: 'archive_import',
                operation: 'restore_coloring_page_metadata',
                archive_schema_version: result.archiveSchemaVersion,
                status: 'partial',
                failed_count: result.errors.length + 1,
                warning_count: warnings.length,
              });
              if (isArchiveMetadataConflict(error)) {
                metadataConflict = true;
              } else {
                metadataRestoreFailed = true;
                result.errors.push(
                  error instanceof Error
                    ? `Page ${page.pageNumber} in ${book.title}: ${error.message}`
                    : `Could not restore page ${page.pageNumber} metadata in ${book.title}`
                );
              }
            }
          }
        } else {
          metadataConflict = true;
        }

        if (metadataConflict) {
          const message = `Page ${page.pageNumber} in ${book.title}: current metadata differs from the archive and no safe restore checkpoint matches it`;
          warnings.push({
            code: 'coloring-page-metadata-conflict',
            message,
            recordRef: page.ref,
          });
          result.errors.push(message);
          result.skippedRecordCount += 1;
        }
        if (metadataRestoreFailed) continue;

        const presentPhotoPaths = page.photoPaths.filter(path => {
          if (bundle.zip.file(path)) return true;
          if (
            !warnings.some(
              warning => warning.code === 'missing-photo-file' && warning.path === path
            )
          ) {
            warnings.push({
              code: 'missing-photo-file',
              message: `Archive photo is missing: ${path}`,
              path,
            });
          }
          return false;
        });
        const skippedPhotoCount = Math.min(createdPage.photos.length, presentPhotoPaths.length);
        const remainingPhotoPaths = presentPhotoPaths.slice(skippedPhotoCount);
        let photoAppendFailed = false;
        for (
          let batchStart = 0;
          batchStart < remainingPhotoPaths.length;
          batchStart += ARCHIVE_PAGE_PHOTO_BATCH_SIZE
        ) {
          try {
            const photoFiles: File[] = [];
            for (const path of remainingPhotoPaths.slice(
              batchStart,
              batchStart + ARCHIVE_PAGE_PHOTO_BATCH_SIZE
            )) {
              const photoFile = await loadPhotoFile(
                bundle.zip,
                path,
                'coloring-page-photo',
                warnings,
                extractionBudget
              );
              if (photoFile) photoFiles.push(photoFile);
            }
            if (photoFiles.length > 0) {
              await adapter.appendColoringPagePhotos(createdPage.id, photoFiles);
              result.importedPhotoCount += photoFiles.length;
            }
          } catch (error) {
            captureImportExportException(error, {
              source: 'archive_import',
              operation: 'append_coloring_page_photos',
              archive_schema_version: result.archiveSchemaVersion,
              status: 'partial',
              failed_count: result.errors.length + 1,
              warning_count: warnings.length,
            });
            result.errors.push(
              error instanceof Error
                ? `Page ${page.pageNumber} in ${book.title}: ${error.message}`
                : `Could not import page ${page.pageNumber} in ${book.title}`
            );
            photoAppendFailed = true;
            break;
          }
        }
        if (photoAppendFailed) continue;
        if (skippedPhotoCount > 0) {
          result.skippedRecordCount += skippedPhotoCount;
          result.skippedPagePhotoCount += skippedPhotoCount;
          warnings.push({
            code: 'skipped-existing-coloring-page-photos',
            message: `Page ${page.pageNumber}: skipped ${skippedPhotoCount} of ${
              presentPhotoPaths.length
            } archived photo${
              presentPhotoPaths.length === 1 ? '' : 's'
            } because this page already has ${createdPage.photos.length} photo${
              createdPage.photos.length === 1 ? '' : 's'
            }`,
            recordRef: page.ref,
          });
        }

        if (
          page.colorReference &&
          (page.colorReference.notes.trim() || page.colorReference.photoPaths.length)
        ) {
          try {
            if (!adapter.restoreColorReference)
              throw new Error('Color reference restore is unavailable.');
            const reference = page.colorReference;
            const fingerprint =
              bundle.archiveFingerprint ??
              (await fingerprintArchiveManifest(JSON.stringify(bundle.manifest)));
            const restored = await adapter.restoreColorReference(
              createdPage.id,
              reference.notes,
              reference.photoPaths,
              async path => {
                const entry = bundle.zip.file(path);
                if (!entry) throw new Error(`Swatch photo is missing from this archive: ${path}`);
                const blob = await readBoundedBlob(
                  entry,
                  MAX_ARCHIVE_ENTRY_BYTES,
                  extractionBudget,
                  MAX_ARCHIVE_EXPANDED_BYTES
                );
                return normalizeImageFile(new File([blob], path.split('/').pop()!));
              },
              `${fingerprint}:${page.ref}`
            );
            applyColorReferenceRestoreProgress(result, reference.ref, restored);
          } catch (error) {
            if (error instanceof PartialColorReferenceRestoreError && page.colorReference) {
              applyColorReferenceRestoreProgress(result, page.colorReference.ref, error);
            }
            captureImportExportException(error, {
              source: 'archive_import',
              operation: 'restore_coloring_color_reference',
              archive_schema_version: result.archiveSchemaVersion,
              status: 'partial',
              failed_count: result.errors.length + 1,
              warning_count: warnings.length,
            });
            result.errors.push(
              error instanceof Error
                ? `Page ${page.pageNumber} in ${book.title}: ${error.message}`
                : `Could not restore color reference for page ${page.pageNumber} in ${book.title}`
            );
          }
        }

        if (page.progressNotes.length > 0) {
          const existingNoteKeys = new Set(
            (await adapter.listColoringPageProgressNotes(createdPage.id)).map(progressNoteKey)
          );
          for (const note of page.progressNotes) {
            const noteKey = progressNoteKey(note);
            if (existingNoteKeys.has(noteKey)) {
              result.skippedRecordCount += 1;
              continue;
            }

            const imageFile = await loadPhotoFile(
              bundle.zip,
              note.imagePath,
              'coloring-page-progress-note',
              warnings,
              extractionBudget
            );
            const createdNote = await adapter.createColoringPageProgressNote(
              createdPage.id,
              { content: note.content, date: note.date },
              imageFile
            );
            if (createdNote?.id) {
              result.refMap[note.ref] = createdNote.id;
            }
            result.createdProgressNoteCount += 1;
            if (imageFile) result.importedPhotoCount += 1;
            existingNoteKeys.add(noteKey);
          }
        }
      }
      if (archiveRestore && adapter.reconcileColoringBookMetrics) {
        await adapter.reconcileColoringBookMetrics(createdBook.id);
      }
      if (result.errors.length === errorCountBeforeBook) {
        recoveryStore?.completeBook(book.ref);
      }
    } catch (error) {
      captureImportExportException(error, {
        source: 'archive_import',
        operation: 'import_coloring_book',
        archive_schema_version: result.archiveSchemaVersion,
        status: 'partial',
        failed_count: result.errors.length + 1,
        warning_count: warnings.length,
      });
      result.errors.push(error instanceof Error ? error.message : `Could not import ${book.title}`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

export async function importOrganizedGlitterArchive(file: File): Promise<ArchiveImportResult> {
  if (!isAuthenticated()) {
    throw new Error('You must be logged in to import an archive');
  }
  const user = getCurrentUser();
  if (!user?.id) {
    throw new Error('You must be logged in to import an archive');
  }

  const bundle = await readOrganizedGlitterArchive(file);
  const archiveFingerprint =
    bundle.archiveFingerprint ??
    (await fingerprintArchiveManifest(JSON.stringify(bundle.manifest)));
  return withArchiveImportLock(`organized-glitter:archive-import:${user.id}`, () => {
    const adapter = createDefaultArchiveImportAdapter(user.id);
    const recoveryStore = createArchiveImportRecoveryStore(user.id, archiveFingerprint);
    return importArchiveBundle(bundle, adapter, recoveryStore);
  });
}
