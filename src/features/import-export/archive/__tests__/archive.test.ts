import { ArchiveRestoreSignInError } from '@/services/pocketbase/archiveColorKeys.service';
import JSZip from 'jszip';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => file),
}));

const { serviceMocks, mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  serviceMocks: {
    auth: {
      isAuthenticated: vi.fn(),
      getCurrentUser: vi.fn(),
    },
    archiveFilesService: {
      getPrivateFileToken: vi.fn(),
      restoreDiamondProject: vi.fn(),
      restoreColoringPageMetadata: vi.fn(),
      restoreColoringBookBatch: vi.fn(),
      reconcileColoringBookMetrics: vi.fn(),
    },
    pocketbase: {
      resolveFileUrl: vi.fn(
        (collectionName: string, recordId: string, filename: string) =>
          `https://pb.example/api/files/${collectionName}/${recordId}/${filename}`
      ),
    },
    projectsService: {
      getAllForUser: vi.fn(),
      create: vi.fn(),
    },
    progressNotesService: {
      listForUser: vi.fn(),
      listAllForUser: vi.fn(),
      create: vi.fn(),
    },
    coloringService: {
      listBooks: vi.fn(),
      listAllBooks: vi.fn(),
      listPages: vi.fn(),
      listAllPages: vi.fn(),
      listAllPagesByBook: vi.fn(),
      createBook: vi.fn(),
      updatePage: vi.fn(),
    },
    coloringMediumsService: {
      listColoringMediums: vi.fn(),
      createColoringMedium: vi.fn(),
    },
    coloringPageProgressNotesService: {
      listForUser: vi.fn(),
      listAllForUser: vi.fn(),
      listByPage: vi.fn(),
      create: vi.fn(),
    },
    bookPublishersService: {
      createIfNotExists: vi.fn(),
    },
    bookIllustratorsService: {
      createIfNotExists: vi.fn(),
    },
    coloringTagService: {
      listColoringTags: vi.fn(),
      createColoringTag: vi.fn(),
      syncBookTags: vi.fn(),
    },
    archiveColorKeysService: { list: vi.fn().mockResolvedValue([]), restore: vi.fn() },
    colorReferencesService: {
      list: vi.fn().mockResolvedValue([]),
      restore: vi.fn(),
    },
  },
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: vi.fn(),
  captureException: mockCaptureException,
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: { authStore: { token: '', record: null, onChange: vi.fn(() => vi.fn()) } },
  resolveFileUrl: serviceMocks.pocketbase.resolveFileUrl,
}));

vi.mock('@/services/pocketbase/archiveColorKeys.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/pocketbase/archiveColorKeys.service')>()),
  ArchiveColorKeysService: serviceMocks.archiveColorKeysService,
}));

vi.mock('@/services/pocketbase/colorReferences.service', () => ({
  ColorReferencesService: serviceMocks.colorReferencesService,
}));

vi.mock('@/services/auth', () => serviceMocks.auth);

vi.mock('@/services/pocketbase/archiveFiles.service', () => ({
  ArchiveFilesService: serviceMocks.archiveFilesService,
}));

vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: serviceMocks.projectsService,
}));

vi.mock('@/services/pocketbase/progressNotes.service', () => ({
  ProgressNotesService: serviceMocks.progressNotesService,
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: serviceMocks.coloringService,
}));

vi.mock('@/services/pocketbase/coloringMediums.service', () => ({
  ColoringMediumsService: serviceMocks.coloringMediumsService,
}));

vi.mock('@/services/pocketbase/coloringPageProgressNotes.service', () => ({
  ColoringPageProgressNotesService: serviceMocks.coloringPageProgressNotesService,
}));

vi.mock('@/services/pocketbase/bookPublishers.service', () => ({
  BookPublishersService: serviceMocks.bookPublishersService,
}));

vi.mock('@/services/pocketbase/bookIllustrators.service', () => ({
  BookIllustratorsService: serviceMocks.bookIllustratorsService,
}));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: serviceMocks.coloringTagService,
}));

import { createArchiveImportRecoveryStore } from '@/features/import-export/archive/archiveImportRecovery';
import { validateArchiveManifest } from '@/features/import-export/archive/archiveManifest';
import type { ArchiveExportSourceData } from '@/features/import-export/archive/exportArchive';
import {
  createArchiveZipFromData,
  exportArchiveZip,
} from '@/features/import-export/archive/exportArchive';
import {
  importArchiveBundle,
  type ArchiveImportAdapter,
} from '@/features/import-export/archive/importArchive';
import type {
  ArchiveColoringPage,
  OrganizedGlitterArchiveManifestV1,
} from '@/features/import-export/archive/types';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

const navigatorLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request: vi.fn((_name: string, callback: (lock: Lock | null) => unknown) => callback(null)),
  } as unknown as LockManager,
});

afterAll(() => {
  if (navigatorLocksDescriptor) Object.defineProperty(navigator, 'locks', navigatorLocksDescriptor);
  else delete (navigator as Navigator & { locks?: LockManager }).locks;
});

function validManifest(
  overrides: Partial<OrganizedGlitterArchiveManifestV1> = {}
): OrganizedGlitterArchiveManifestV1 {
  return {
    schemaVersion: 1,
    exportedAt: '2026-05-20T00:00:00.000Z',
    source: 'organized-glitter',
    files: [],
    diamondProjects: [],
    coloringMediums: [],
    coloringBooks: [],
    warnings: [],
    ...overrides,
  };
}

function archiveColoringPage(pageNumber: number): ArchiveColoringPage {
  return {
    ref: `coloring-page:old-page-${pageNumber}`,
    oldId: `old-page-${pageNumber}`,
    pageNumber,
    status: 'not_started',
    mediumRefs: [],
    photoPaths: [],
    progressNotes: [],
  };
}

function makeColoringPage(overrides: Partial<ColoringPageDTO> = {}): ColoringPageDTO {
  return {
    id: 'page-1',
    bookId: 'book-1',
    pageNumber: 1,
    status: 'not_started',
    photos: [],
    mediumIds: [],
    revealedSubject: '',
    revealedAt: '',
    startedAt: '',
    completedAt: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function snapshotForTest() {
  return {
    status: 'not_started' as const,
    mediumIds: [],
    revealedSubject: '',
    revealedAt: '',
    startedAt: '',
    completedAt: '',
  };
}

function makeImportAdapter(overrides: Partial<ArchiveImportAdapter> = {}): ArchiveImportAdapter {
  return {
    listExistingProjects: vi.fn().mockResolvedValue([]),
    createDiamondProject: vi.fn(),
    addDiamondTags: vi.fn(),
    listDiamondProgressNotes: vi.fn().mockResolvedValue([]),
    createDiamondProgressNote: vi.fn(),
    listExistingColoringBooks: vi.fn().mockResolvedValue([]),
    createColoringBook: vi.fn(),
    addColoringBookTags: vi.fn(),
    listColoringMediums: vi.fn().mockResolvedValue([]),
    createColoringMedium: vi.fn(),
    listColoringPages: vi.fn().mockResolvedValue([]),
    restoreColoringPageMetadata: vi.fn(),
    reconcileColoringBookMetrics: vi.fn(),
    appendColoringPagePhotos: vi.fn(),
    listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
    createColoringPageProgressNote: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCaptureException.mockClear();
  serviceMocks.auth.isAuthenticated.mockReturnValue(true);
  serviceMocks.auth.getCurrentUser.mockReturnValue({ id: 'user-1' });
  serviceMocks.archiveFilesService.getPrivateFileToken.mockResolvedValue('private-file-token');
  serviceMocks.pocketbase.resolveFileUrl.mockImplementation(
    (collectionName: string, recordId: string, filename: string) =>
      `https://pb.example/api/files/${collectionName}/${recordId}/${filename}`
  );
  serviceMocks.projectsService.getAllForUser.mockResolvedValue([]);
  serviceMocks.progressNotesService.listForUser.mockResolvedValue({
    items: [],
    totalItems: 0,
    totalPages: 0,
  });
  serviceMocks.progressNotesService.listAllForUser.mockResolvedValue([]);
  serviceMocks.coloringService.listBooks.mockResolvedValue({
    items: [],
    totalItems: 0,
    totalPages: 0,
    page: 1,
    perPage: 5000,
  });
  serviceMocks.coloringService.listAllBooks.mockResolvedValue([]);
  serviceMocks.coloringService.listPages.mockResolvedValue({
    items: [],
    totalItems: 0,
    totalPages: 0,
    page: 1,
    perPage: 1000,
  });
  serviceMocks.coloringService.listAllPages.mockResolvedValue([]);
  serviceMocks.coloringService.listAllPagesByBook.mockResolvedValue({});
  serviceMocks.coloringMediumsService.listColoringMediums.mockResolvedValue({
    items: [],
    totalItems: 0,
    totalPages: 0,
  });
  serviceMocks.coloringMediumsService.createColoringMedium.mockResolvedValue({
    id: 'new-medium',
    userId: 'user-1',
    name: 'Colored pencil',
    type: 'colored_pencil',
    brand: '',
    colorCount: 0,
    notes: '',
    createdAt: '',
    updatedAt: '',
  });
  serviceMocks.coloringPageProgressNotesService.listForUser.mockResolvedValue({
    items: [],
    totalItems: 0,
    totalPages: 0,
    page: 1,
    perPage: 5000,
  });
  serviceMocks.coloringPageProgressNotesService.listAllForUser.mockResolvedValue([]);
  serviceMocks.coloringPageProgressNotesService.listByPage.mockResolvedValue([]);
  serviceMocks.bookPublishersService.createIfNotExists.mockResolvedValue({ id: 'publisher-1' });
  serviceMocks.bookIllustratorsService.createIfNotExists.mockResolvedValue({ id: 'illustrator-1' });
  serviceMocks.coloringTagService.listColoringTags.mockResolvedValue({ data: [] });
  serviceMocks.coloringTagService.syncBookTags.mockResolvedValue({ data: undefined });
});

describe('archive manifest', () => {
  it('rejects unsafe paths', () => {
    expect(() =>
      validateArchiveManifest(
        validManifest({
          files: [
            {
              path: '../secret.jpg',
              role: 'project-cover',
              recordRef: 'project:old-1',
              field: 'image',
            },
          ],
        })
      )
    ).toThrow(/unsafe file path/i);

    expect(() =>
      validateArchiveManifest(
        validManifest({
          files: [
            {
              path: 'photos/%2e%2e/secret.jpg',
              role: 'project-cover',
              recordRef: 'project:old-1',
              field: 'image',
            },
          ],
        })
      )
    ).toThrow(/unsafe file path/i);

    expect(() =>
      validateArchiveManifest(
        validManifest({
          files: [
            {
              path: 'photos/%00secret.jpg',
              role: 'project-cover',
              recordRef: 'project:old-1',
              field: 'image',
            },
          ],
        })
      )
    ).toThrow(/unsafe file path/i);
  });
});

describe('archive export', () => {
  it('maps stored diamond project fields through the ZIP manifest and adapter', async () => {
    const project = {
      id: 'project-1',
      userId: 'user-1',
      title: 'Starry Fox',
      company: 'Diamond Co',
      artist: 'Avery',
      status: 'progress' as const,
      kitCategory: 'mini' as const,
      drillShape: 'round',
      width: 40,
      height: 50,
      totalDiamonds: 18000,
      colorCount: 42,
      datePurchased: '2025-01-01',
      dateReceived: '2025-01-02',
      dateStarted: '2025-01-03',
      dateCompleted: '2025-01-04',
      generalNotes: 'A note',
      sourceUrl: 'https://example.com/project',
      tags: [],
      imageUrl: '',
      createdAt: '',
      updatedAt: '',
    };
    const { blob } = await createArchiveZipFromData({
      projects: [project],
      projectProgressNotes: [],
      coloringBooks: [],
      coloringPagesByBookId: {},
      coloringMediums: [],
      coloringPageProgressNotes: [],
    });
    const zip = await JSZip.loadAsync(blob);
    const manifest = validateArchiveManifest(
      JSON.parse(await zip.file('manifest.json')!.async('string'))
    );
    const archived = manifest.diamondProjects[0];
    expect(archived).toMatchObject({
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
    });
    const createDiamondProject = vi.fn().mockResolvedValue({ id: 'restored-project' });
    const result = await importArchiveBundle(
      { zip, manifest, warnings: [] },
      makeImportAdapter({ createDiamondProject })
    );
    expect(result.errors).toEqual([]);
    expect(createDiamondProject).toHaveBeenCalledWith(archived, undefined, undefined);
  });

  it('aborts export when a related record changes during ZIP creation', async () => {
    serviceMocks.projectsService.getAllForUser.mockResolvedValue([]);
    serviceMocks.progressNotesService.listAllForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'late-note',
          projectId: 'project-1',
          content: 'Changed',
          date: '2026-05-20',
          createdAt: '',
          updatedAt: '',
        },
      ]);
    await expect(exportArchiveZip()).rejects.toThrow(/changed during export.*retry/i);
    expect(serviceMocks.projectsService.getAllForUser).toHaveBeenCalledTimes(2);
  });
});

describe('archive import', () => {
  it('creates records in dependency order and maps old refs to new IDs', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:old-project',
          oldId: 'old-project',
          title: 'Starry Fox',
          status: 'purchased',
          tags: ['Fantasy'],
          coverPhotoPath: 'photos/projects/old-project/cover.jpg',
          progressNotes: [
            {
              ref: 'project-note:old-note',
              oldId: 'old-note',
              content: 'Old note',
              date: '2024-05-10',
              imagePath: 'photos/projects/old-project/progress-notes/old-note.jpg',
            },
          ],
        },
      ],
      coloringMediums: [
        {
          ref: 'coloring-medium:old-medium',
          oldId: 'old-medium',
          name: 'Colored pencil',
          type: 'colored_pencil',
          brand: 'Prismacolor',
          colorCount: 48,
          notes: 'Archive medium',
        },
      ],
      coloringBooks: [
        {
          ref: 'coloring-book:old-book',
          oldId: 'old-book',
          title: 'Forest Animals',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:old-page',
              oldId: 'old-page',
              pageNumber: 1,
              status: 'in_progress',
              mediumRefs: ['coloring-medium:old-medium'],
              photoPaths: ['photos/coloring-books/old-book/pages/1/1.jpg'],
              progressNotes: [
                {
                  ref: 'coloring-page-note:old-page-note',
                  oldId: 'old-page-note',
                  content: 'Page note',
                  date: '2024-05-11',
                },
              ],
            },
          ],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('photos/projects/old-project/cover.jpg', new Blob(['cover']));
    zip.file('photos/projects/old-project/progress-notes/old-note.jpg', new Blob(['note']));
    zip.file('photos/coloring-books/old-book/pages/1/1.jpg', new Blob(['page']));
    const calls: string[] = [];
    const adapter: ArchiveImportAdapter = {
      listExistingProjects: vi.fn().mockResolvedValue([]),
      createDiamondProject: vi.fn().mockImplementation(async () => {
        calls.push('create-project');
        return { id: 'new-project' };
      }),
      addDiamondTags: vi.fn().mockImplementation(async projectId => {
        calls.push(`tags:${projectId}`);
      }),
      listDiamondProgressNotes: vi.fn().mockResolvedValue([]),
      createDiamondProgressNote: vi.fn().mockImplementation(async projectId => {
        calls.push(`project-note:${projectId}`);
        return { id: 'new-project-note' };
      }),
      listExistingColoringBooks: vi.fn().mockResolvedValue([]),
      createColoringBook: vi.fn().mockImplementation(async () => {
        calls.push('create-book');
        return { id: 'new-book' };
      }),
      addColoringBookTags: vi.fn().mockResolvedValue(undefined),
      listColoringMediums: vi.fn().mockResolvedValue([]),
      createColoringMedium: vi.fn().mockImplementation(async () => {
        calls.push('create-medium');
        return {
          id: 'new-medium',
          userId: 'user-1',
          name: 'Colored pencil',
          type: 'colored_pencil',
          brand: 'Prismacolor',
          colorCount: 48,
          notes: 'Archive medium',
          createdAt: '',
          updatedAt: '',
        };
      }),
      listColoringPages: vi.fn().mockResolvedValue([
        {
          id: 'new-page',
          bookId: 'new-book',
          pageNumber: 1,
          status: 'not_started',
          photos: [],
          mediumIds: [],
          revealedSubject: '',
          revealedAt: '',
          startedAt: '',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ]),
      restoreColoringPageMetadata: vi.fn().mockImplementation(async input => {
        calls.push(`page-metadata:${input.pageId}`);
        return {
          id: input.pageId,
          bookId: 'new-book',
          pageNumber: 1,
          status: 'in_progress',
          photos: ['1.jpg'],
          mediumIds: [],
          revealedSubject: '',
          revealedAt: '',
          startedAt: '',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        };
      }),
      appendColoringPagePhotos: vi.fn().mockImplementation(async pageId => {
        calls.push(`page-photos:${pageId}`);
        return {
          id: pageId,
          bookId: 'new-book',
          pageNumber: 1,
          status: 'in_progress',
          photos: ['1.jpg'],
          mediumIds: [],
          revealedSubject: '',
          revealedAt: '',
          startedAt: '',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        };
      }),
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn().mockImplementation(async pageId => {
        calls.push(`page-note:${pageId}`);
        return { id: 'new-page-note' };
      }),
    };

    const result = await importArchiveBundle({ zip, manifest, warnings: [] }, adapter);

    expect(result.createdProjectCount).toBe(1);
    expect(result.createdColoringBookCount).toBe(1);
    expect(result.importedPhotoCount).toBe(3);
    expect(result.refMap).toMatchObject({
      'project:old-project': 'new-project',
      'project-note:old-note': 'new-project-note',
      'coloring-book:old-book': 'new-book',
      'coloring-medium:old-medium': 'new-medium',
      'coloring-page:old-page': 'new-page',
      'coloring-page-note:old-page-note': 'new-page-note',
    });
    expect(calls).toEqual([
      'create-medium',
      'create-project',
      'tags:new-project',
      'project-note:new-project',
      'create-book',
      'page-metadata:new-page',
      'page-photos:new-page',
      'page-note:new-page',
    ]);
    expect(adapter.restoreColoringPageMetadata).toHaveBeenCalledWith({
      pageId: 'new-page',
      baseline: expect.objectContaining({ status: 'not_started' }),
      intended: expect.objectContaining({
        status: 'in_progress',
        mediumIds: ['new-medium'],
      }),
    });
    expect(adapter.appendColoringPagePhotos).toHaveBeenCalledWith('new-page', [expect.any(File)]);
  });

  it('does not remap a missing confirmed recovery target to a natural match', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:missing-target',
          oldId: 'missing-target',
          title: 'Same kit',
          sourceUrl: 'https://example.com/same-kit',
          status: 'purchased',
          tags: [],
          progressNotes: [],
        },
      ],
    });
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'missing-target', null);
    recoveryStore.saveProject('project:missing-target', {
      projectId: 'deleted-project',
      isArchiveCreated: true,
      creationConfirmed: true,
      tagsRestored: true,
    });
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockResolvedValue([
        {
          id: 'other-project',
          title: 'Same kit',
          sourceUrl: 'https://example.com/same-kit',
        },
      ]),
    });

    const result = await importArchiveBundle(
      { zip: new JSZip(), manifest, warnings: [] },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      'Archive recovery target for project:missing-target ("Same kit") no longer exists. The record was not merged with another project.',
    ]);
    expect(result.refMap['project:missing-target']).toBeUndefined();
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
  });

  it('appends only missing archive page photos on retry', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:old-book',
          oldId: 'old-book',
          title: 'Retry Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:old-page',
              oldId: 'old-page',
              pageNumber: 1,
              status: 'completed',
              mediumRefs: [],
              photoPaths: [
                'photos/coloring-books/old-book/pages/1/1.jpg',
                'photos/coloring-books/old-book/pages/1/2.jpg',
              ],
              progressNotes: [],
            },
          ],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('photos/coloring-books/old-book/pages/1/1.jpg', new Blob(['first']));
    zip.file('photos/coloring-books/old-book/pages/1/2.jpg', new Blob(['second']));
    const appendColoringPagePhotos = vi.fn().mockResolvedValue({
      id: 'current-page',
      bookId: 'current-book',
      pageNumber: 1,
      status: 'completed',
      photos: ['existing.jpg', '2.jpg'],
      mediumIds: [],
      revealedSubject: '',
      revealedAt: '',
      startedAt: '',
      completedAt: '',
      createdAt: '',
      updatedAt: '',
    });
    const adapter: ArchiveImportAdapter = {
      listExistingProjects: vi.fn().mockResolvedValue([]),
      createDiamondProject: vi.fn(),
      addDiamondTags: vi.fn(),
      listDiamondProgressNotes: vi.fn(),
      createDiamondProgressNote: vi.fn(),
      listExistingColoringBooks: vi.fn().mockResolvedValue([
        {
          id: 'current-book',
          title: 'Retry Book',
        },
      ]),
      createColoringBook: vi.fn(),
      addColoringBookTags: vi.fn(),
      listColoringMediums: vi.fn().mockResolvedValue([]),
      createColoringMedium: vi.fn(),
      listColoringPages: vi.fn().mockResolvedValue([
        {
          id: 'current-page',
          bookId: 'current-book',
          pageNumber: 1,
          status: 'completed',
          photos: ['existing.jpg'],
          mediumIds: [],
          revealedSubject: '',
          revealedAt: '',
          startedAt: '',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ]),
      restoreColoringPageMetadata: vi.fn(),
      appendColoringPagePhotos,
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn(),
    };

    const result = await importArchiveBundle({ zip, manifest, warnings: [] }, adapter);

    expect(result.importedPhotoCount).toBe(1);
    expect(result.skippedRecordCount).toBe(1);
    expect(result.skippedPagePhotoCount).toBe(1);
    expect(result.warnings).toContainEqual({
      code: 'skipped-existing-coloring-page-photos',
      message: 'Page 1: skipped 1 of 2 archived photos because this page already has 1 photo',
      recordRef: 'coloring-page:old-page',
    });
    expect(adapter.restoreColoringPageMetadata).not.toHaveBeenCalled();
    expect(appendColoringPagePhotos).toHaveBeenCalledWith('current-page', [
      expect.objectContaining({ name: '2.jpg' }),
    ]);
  });

  it('reconciles coloring book metrics from final stored page states after conflicts', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:metrics',
          oldId: 'metrics',
          title: 'Metrics Book',
          isMystery: false,
          status: 'in_progress',
          totalPages: 2,
          tags: [],
          pages: [
            { ...archiveColoringPage(1), status: 'completed' },
            { ...archiveColoringPage(2), status: 'completed' },
          ],
        },
      ],
    });
    const firstPage = makeColoringPage({
      id: 'page-1',
      bookId: 'archive-book',
      pageNumber: 1,
      status: 'in_progress',
      revealedSubject: 'Independent edit',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:05:00.000Z',
    });
    const secondPage = makeColoringPage({
      id: 'page-2',
      bookId: 'archive-book',
      pageNumber: 2,
      status: 'completed',
    });
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'metrics-test');
    recoveryStore.saveBook('coloring-book:metrics', {
      bookId: 'archive-book',
      pages: {
        'coloring-page:old-page-1': {
          pageId: 'page-1',
          baseline: { ...snapshotForTest(), updatedAt: '2026-09-05T12:00:00.000Z' },
          intended: { ...snapshotForTest(), status: 'completed' },
        },
      },
    });
    const events: string[] = [];
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi.fn().mockResolvedValue([]),
      getArchiveColoringBookId: vi.fn().mockResolvedValue('archive-book'),
      restoreArchiveColoringBook: vi.fn().mockResolvedValue({
        bookId: 'archive-book',
        created: false,
        pages: [firstPage, secondPage],
      }),
      reconcileColoringBookMetrics: vi.fn().mockImplementation(async bookId => {
        events.push(`reconcile:${bookId}`);
      }),
    });

    const result = await importArchiveBundle(
      {
        zip: new JSZip(),
        manifest,
        warnings: [],
        archiveFingerprint: 'c'.repeat(64),
      },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'coloring-page-metadata-conflict' })
    );
    expect(adapter.reconcileColoringBookMetrics).toHaveBeenCalledOnce();
    expect(adapter.reconcileColoringBookMetrics).toHaveBeenCalledWith('archive-book');
    expect(events).toEqual(['reconcile:archive-book']);
    expect(recoveryStore.getBook('coloring-book:metrics')).toMatchObject({
      bookId: 'archive-book',
    });
  });
});

describe('color reference archive round trips', () => {
  it.each([
    { notes: '', photos: ['one.png', 'two.png'], addedPhotoCount: 2 },
    { notes: '', photos: ['one.png', 'two.png'], addedPhotoCount: 0 },
    { notes: '  001\nBR 709 + RY 08  ', photos: [] },
    { notes: '  001\nBR 709 + RY 08  ', photos: ['one.png', 'two.png'] },
  ])(
    'round trips notes and sheets without page/progress photos: %j',
    async ({ notes, photos, addedPhotoCount = photos.length }) => {
      const page = makeColoringPage();
      const data: ArchiveExportSourceData = {
        projects: [],
        projectProgressNotes: [],
        coloringMediums: [],
        coloringPageProgressNotes: [],
        coloringBooks: [
          {
            id: 'book-1',
            userId: 'user-1',
            title: 'Swatch fixture',
            publisherId: '',
            illustratorId: '',
            series: '',
            theme: '',
            isbn: '',
            edition: '',
            language: '',
            sourceUrl: '',
            datePurchased: '',
            dateReceived: '',
            dateStarted: '',
            dateCompleted: '',
            bookFormat: '',
            notes: '',
            coverImage: '',
            isMystery: false,
            status: 'in_stash',
            totalPages: 1,
            createdAt: '',
            updatedAt: '',
          },
        ],
        coloringPagesByBookId: { 'book-1': [page] },
        colorReferences: [
          {
            id: 'reference-1',
            page: page.id,
            user: 'user-1',
            notes,
            photos,
            created: '',
            updated: '',
            collectionId: 'refs',
            collectionName: 'coloring_page_color_references',
            restore_key: '',
            upload_receipts: null,
          },
        ],
      };
      const { blob, manifest } = await createArchiveZipFromData(data, {
        fileToken: 'test-token',
        fetchImpl: vi.fn(
          async () => new Response('sheet bytes', { headers: { 'content-type': 'image/png' } })
        ),
      });
      expect(manifest.schemaVersion).toBe(2);
      expect(manifest.files.every(file => file.role === 'coloring-swatch-photo')).toBe(true);
      expect(manifest.coloringBooks[0].pages[0].photoPaths).toEqual([]);
      expect(manifest.coloringBooks[0].pages[0].progressNotes).toEqual([]);
      const zip = await JSZip.loadAsync(blob);
      const restoredManifest = validateArchiveManifest(
        JSON.parse(await zip.file('manifest.json')!.async('string'))
      );
      const restore = vi
        .fn()
        .mockResolvedValue({ referenceId: 'restored-reference', addedPhotoCount });
      const adapter = makeImportAdapter({
        createColoringBook: vi.fn().mockResolvedValue({ id: 'new-book' }),
        listColoringPages: vi
          .fn()
          .mockResolvedValue([makeColoringPage({ id: 'new-page', bookId: 'new-book' })]),
        restoreColorReference: restore,
      });
      const result = await importArchiveBundle(
        { zip, manifest: restoredManifest, warnings: [], archiveFingerprint: 'fixture-archive' },
        adapter
      );
      expect(result.errors).toEqual([]);
      expect(result.refMap['coloring-color-reference:reference-1']).toBe('restored-reference');
      expect(result.importedPhotoCount).toBe(addedPhotoCount);
      expect(restore).toHaveBeenCalledWith(
        'new-page',
        notes,
        expect.any(Array),
        expect.any(Function),
        'fixture-archive:coloring-page:page-1'
      );
      const [, , restoredPhotoPaths, loadPhoto] = restore.mock.calls[0] as [
        string,
        string,
        string[],
        (path: string) => Promise<File>,
        string,
      ];
      expect(restoredPhotoPaths).toHaveLength(photos.length);
      for (const path of restoredPhotoPaths) {
        const file = await loadPhoto(path);
        expect(
          await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsText(file);
          })
        ).toBe('sheet bytes');
      }
      expect(adapter.appendColoringPagePhotos).not.toHaveBeenCalled();
      expect(adapter.createColoringPageProgressNote).not.toHaveBeenCalled();
    }
  );
});
describe('color key archives', () => {
  it('exports page keys, skips orphan keys, preserves placeholders and remaps restores', async () => {
    const page = makeColoringPage();
    const key = {
      id: 'key000000000001',
      page: page.id,
      user: 'source-user',
      position: 0,
      symbol: 'r:abc123def456ghi',
      code: '001',
      color_name: 'Rose',
      swatch: '#ff00aa',
      tried: ['002'],
      note: '  keep spacing  ',
      created: '2026-01-01 00:00:00.000Z',
      updated: '2026-02-01 00:00:00.000Z',
    };
    const data: ArchiveExportSourceData = {
      projects: [],
      projectProgressNotes: [],
      coloringMediums: [],
      coloringPageProgressNotes: [],
      coloringBooks: [
        {
          id: 'book-1',
          userId: 'user-1',
          title: 'Swatch fixture',
          publisherId: '',
          illustratorId: '',
          series: '',
          theme: '',
          isbn: '',
          edition: '',
          language: '',
          sourceUrl: '',
          datePurchased: '',
          dateReceived: '',
          dateStarted: '',
          dateCompleted: '',
          bookFormat: '',
          notes: '',
          coverImage: '',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringPagesByBookId: { 'book-1': [page] },
      colorKeys: [key, { ...key, id: 'orphan', page: 'absent-page' }],
    };

    const { blob, manifest } = await createArchiveZipFromData(data);
    expect(manifest.schemaVersion).toBe(4);
    const { id, page: _page, user: _user, ...metadata } = key;
    expect(manifest.coloringBooks[0].pages[0].colorKeys).toEqual([
      { ref: `coloring-color-key:${id}`, ...metadata },
    ]);
    expect(JSON.stringify(manifest)).not.toContain('source-user');
    expect(JSON.stringify(manifest)).not.toContain('coloring_symbol_requests');
    const zip = await JSZip.loadAsync(blob);
    const parsed = validateArchiveManifest(
      JSON.parse(await zip.file('manifest.json')!.async('string'))
    );
    const restore = vi.fn().mockResolvedValue({
      outcome: 'created',
      refMap: { 'coloring-color-key:key000000000001': 'restored-key' },
    });
    const adapter = makeImportAdapter({
      createColoringBook: vi.fn().mockResolvedValue({ id: 'new-book' }),
      listColoringPages: vi
        .fn()
        .mockResolvedValue([makeColoringPage({ id: 'new-page', bookId: 'new-book' })]),
      restoreColorKeys: restore,
    });
    const bundle = { zip, manifest: parsed, warnings: [], archiveFingerprint: 'keys-fixture' };
    const result = await importArchiveBundle(bundle, adapter);
    expect(result.errors).toEqual([]);
    expect(restore).toHaveBeenCalledWith(
      'new-page',
      parsed.coloringBooks[0].pages[0].ref,
      parsed.coloringBooks[0].pages[0].colorKeys,
      'keys-fixture'
    );
    expect(result.refMap[`coloring-color-key:${id}`]).toBe('restored-key');
    await importArchiveBundle(bundle, adapter);
    expect(restore.mock.calls[1]).toEqual(restore.mock.calls[0]);
    parsed.coloringBooks[0].pages[0].colorKeys!.push({
      ...parsed.coloringBooks[0].pages[0].colorKeys![0],
      ref: 'coloring-color-key:second',
    });
    restore.mockClear();
    restore.mockResolvedValue({ outcome: 'skipped', refMap: {} });
    vi.mocked(adapter.listExistingColoringBooks).mockResolvedValue([
      { id: 'new-book', title: 'Swatch fixture', publisher: '', illustrator: '' },
    ]);
    const skipped = await importArchiveBundle(bundle, adapter);
    expect(skipped.errors).toEqual([]);
    expect(restore).toHaveBeenCalledOnce();
    expect(
      skipped.warnings.filter(warning => warning.code === 'skipped-existing-coloring-color-keys')
    ).toHaveLength(1);
    restore.mockRejectedValueOnce(new Error('Invalid or duplicate archive color key.'));
    const failed = await importArchiveBundle(bundle, adapter);
    expect(failed.errors).toEqual([
      'Color keys for page 1 in Swatch fixture could not be restored. Export again and retry.',
    ]);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Import/export operation failed' }),
      expect.objectContaining({ operation: 'restore_coloring_color_key' })
    );
    restore.mockRejectedValueOnce(new ArchiveRestoreSignInError());
    const signedOut = await importArchiveBundle(bundle, adapter);
    expect(signedOut.errors).toEqual(['Sign in again to continue the restore.']);
    vi.mocked(adapter.listExistingColoringBooks).mockResolvedValue([]);
    const secondPage = {
      ...parsed.coloringBooks[0].pages[0],
      ref: 'coloring-page:second' as const,
      oldId: 'second',
      pageNumber: 2,
    };
    expect(() =>
      validateArchiveManifest({
        ...parsed,
        coloringBooks: [
          {
            ...parsed.coloringBooks[0],
            totalPages: 2,
            pages: [parsed.coloringBooks[0].pages[0], secondPage],
          },
        ],
      })
    ).toThrow('duplicate color key');
    const largeData = {
      ...data,
      coloringBooks: [{ ...data.coloringBooks[0], totalPages: 2500 }],
      coloringPagesByBookId: {
        'book-1': Array.from({ length: 2500 }, (_, i) =>
          makeColoringPage({ id: `page-${i}`, pageNumber: i + 1 })
        ),
      },
      colorKeys: Array.from({ length: 100000 }, (_, i) => ({
        ...key,
        id: `key${i}`,
        page: `page-${Math.floor(i / 40)}`,
        position: i % 40,
      })),
    };
    const largeArchive = await createArchiveZipFromData(largeData);
    expect(() => validateArchiveManifest(largeArchive.manifest)).not.toThrow();
    largeData.colorKeys.push({ ...key, id: 'over-budget', page: 'page-0' });
    await expect(createArchiveZipFromData(largeData)).rejects.toThrow(
      'The archive exceeds 100,000 color keys at page 2500 in Swatch fixture.'
    );
    await expect(
      createArchiveZipFromData({
        ...data,
        colorKeys: Array.from({ length: 501 }, (_, i) => ({ ...key, id: `limit${i}` })),
      })
    ).rejects.toThrow('Page 1 in Swatch fixture has more than 500 color keys.');
    delete parsed.coloringBooks[0].pages[0].colorKeys;
    parsed.schemaVersion = 2;
    restore.mockClear();
    vi.mocked(adapter.createColoringBook).mockClear();
    const oldResult = await importArchiveBundle(bundle, adapter);
    expect(oldResult.errors).toEqual([]);
    expect(oldResult.createdColoringBookCount).toBe(1);
    expect(adapter.createColoringBook).toHaveBeenCalledOnce();
    expect(oldResult.refMap[parsed.coloringBooks[0].pages[0].ref]).toBe('new-page');
    expect(restore).not.toHaveBeenCalled();
  });
  it.each([
    ['a changed archive', Object.assign(new Error('conflict'), { status: 409 })],
    ['an expired session', new ArchiveRestoreSignInError()],
  ])('stops the restore after %s', async (_, failure) => {
    const pages = [makeColoringPage(), makeColoringPage({ id: 'page-2', pageNumber: 2 })];
    const key = {
      id: 'key000000000001',
      page: 'page-1',
      user: 'source-user',
      position: 0,
      symbol: 'r:abc123def456ghi',
      code: '001',
      color_name: 'Rose',
      swatch: '#ff00aa',
      tried: [],
      note: '',
      created: '2026-01-01 00:00:00.000Z',
      updated: '2026-02-01 00:00:00.000Z',
    };
    const data: ArchiveExportSourceData = {
      projects: [],
      projectProgressNotes: [],
      coloringMediums: [],
      coloringPageProgressNotes: [
        {
          id: 'coloring-note-1',
          pageId: 'page-1',
          content: 'after keys',
          date: '2026-05-02',
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringBooks: [
        {
          id: 'book-1',
          userId: 'user-1',
          title: 'Swatch fixture',
          publisherId: '',
          illustratorId: '',
          series: '',
          theme: '',
          isbn: '',
          edition: '',
          language: '',
          sourceUrl: '',
          datePurchased: '',
          dateReceived: '',
          dateStarted: '',
          dateCompleted: '',
          bookFormat: '',
          notes: '',
          coverImage: '',
          isMystery: false,
          status: 'in_stash',
          totalPages: 2,
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringPagesByBookId: { 'book-1': pages },
      colorKeys: [key, { ...key, id: 'key000000000002', page: 'page-2' }],
    };
    const { blob } = await createArchiveZipFromData(data);
    const zip = await JSZip.loadAsync(blob);
    const manifest = validateArchiveManifest(
      JSON.parse(await zip.file('manifest.json')!.async('string'))
    );
    const restore = vi.fn().mockRejectedValue(failure);
    const adapter = makeImportAdapter({
      createColoringBook: vi.fn().mockResolvedValue({ id: 'new-book' }),
      listColoringPages: vi
        .fn()
        .mockResolvedValue([
          makeColoringPage({ id: 'new-page', bookId: 'new-book' }),
          makeColoringPage({ id: 'new-page-2', bookId: 'new-book', pageNumber: 2 }),
        ]),
      restoreColorKeys: restore,
    });
    const result = await importArchiveBundle(
      { zip, manifest, warnings: [], archiveFingerprint: 'keys-fixture' },
      adapter
    );
    expect(restore).toHaveBeenCalledOnce();
    expect(adapter.createColoringPageProgressNote).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
