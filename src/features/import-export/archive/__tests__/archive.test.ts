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
  resolveFileUrl: serviceMocks.pocketbase.resolveFileUrl,
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

import {
  findMissingOptionalPhotoWarnings,
  validateArchiveManifest,
} from '@/features/import-export/archive/archiveManifest';
import {
  createArchiveZipFromData,
  exportArchiveZip,
  loadArchiveExportSourceData,
} from '@/features/import-export/archive/exportArchive';
import {
  importArchiveBundle,
  importOrganizedGlitterArchive,
  PartialColorReferenceRestoreError,
  readOrganizedGlitterArchive,
  restoreArchivedColorReference,
  withArchiveImportLock,
  type ArchiveImportAdapter,
} from '@/features/import-export/archive/importArchive';
import {
  createArchiveImportRecoveryStore,
  deriveArchiveColoringBookId,
  type ColoringBookRecoveryCheckpoint,
} from '@/features/import-export/archive/archiveImportRecovery';
import { IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES } from '@/features/import-export/importExportFileLimits';
import type {
  ArchiveColoringPage,
  OrganizedGlitterArchiveManifestV1,
} from '@/features/import-export/archive/types';
import type { ArchiveExportSourceData } from '@/features/import-export/archive/exportArchive';
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

const COLORING_BOOK_METADATA_EXPAND = 'publisher,illustrator,coloring_book_tags_via_book.tag';

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
  it('accepts a valid v1 manifest', () => {
    expect(validateArchiveManifest(validManifest()).schemaVersion).toBe(1);
  });

  it('rejects unsupported manifest versions', () => {
    expect(() => validateArchiveManifest({ ...validManifest(), schemaVersion: 99 })).toThrow(
      /unsupported archive schema version/i
    );
  });

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

  it('rejects malformed nested arrays before iterating over archive records', () => {
    expect(() =>
      validateArchiveManifest(
        validManifest({
          diamondProjects: [
            {
              ref: 'project:old-1',
              oldId: 'old-1',
              title: 'Broken project',
              status: 'purchased',
              tags: [],
              progressNotes: undefined as never,
            },
          ],
        })
      )
    ).toThrow(/progressNotes array/i);

    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [
            {
              ref: 'coloring-book:old-book',
              oldId: 'old-book',
              title: 'Broken book',
              isMystery: false,
              status: 'in_stash',
              totalPages: 1,
              tags: [],
              pages: [
                {
                  ref: 'coloring-page:old-page',
                  oldId: 'old-page',
                  pageNumber: 1,
                  status: 'not_started',
                  mediumRefs: [],
                  photoPaths: undefined as never,
                  progressNotes: [],
                },
              ],
            },
          ],
        })
      )
    ).toThrow(/photoPaths array/i);
  });

  it('rejects more than 99 coloring page photos before restore writes', () => {
    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [
            {
              ref: 'coloring-book:many-photos',
              oldId: 'many-photos',
              title: 'Many photos',
              isMystery: false,
              status: 'in_stash',
              totalPages: 1,
              tags: [],
              pages: [
                {
                  ...archiveColoringPage(1),
                  photoPaths: Array.from({ length: 100 }, (_, i) => `photos/${i}.jpg`),
                },
              ],
            },
          ],
        })
      )
    ).toThrow(/99 photos/i);
  });

  it('requires positive safe coloring book and page numbers', () => {
    const archiveBook = {
      ref: 'coloring-book:old-book' as const,
      oldId: 'old-book',
      title: 'Invalid page count',
      isMystery: false,
      status: 'in_stash' as const,
      totalPages: 1,
      tags: [],
      pages: [archiveColoringPage(1)],
    };

    for (const totalPages of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        validateArchiveManifest(validManifest({ coloringBooks: [{ ...archiveBook, totalPages }] }))
      ).toThrow(/positive safe integer/i);
    }
    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [{ ...archiveBook, pages: [archiveColoringPage(1.5)] }],
        })
      )
    ).toThrow(/invalid or duplicate page number/i);
    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [
            {
              ...archiveBook,
              pages: [archiveColoringPage(1), { ...archiveColoringPage(2), pageNumber: 1 }],
            },
          ],
        })
      )
    ).toThrow(/invalid or duplicate page number/i);
  });

  it('requires exact page coverage only for legacy books above 500 pages', () => {
    const pages = Array.from({ length: 501 }, (_, index) => archiveColoringPage(index + 1));
    const archiveBook = {
      ref: 'coloring-book:legacy-book' as const,
      oldId: 'legacy-book',
      title: 'Legacy page count',
      isMystery: false,
      status: 'in_stash' as const,
      totalPages: 501,
      tags: [],
      pages,
    };

    expect(
      validateArchiveManifest(validManifest({ coloringBooks: [archiveBook] })).coloringBooks[0]
        .totalPages
    ).toBe(501);
    expect(() =>
      validateArchiveManifest(
        validManifest({ coloringBooks: [{ ...archiveBook, pages: pages.slice(0, 500) }] })
      )
    ).toThrow(/include every declared page exactly once/i);

    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [
            {
              ...archiveBook,
              totalPages: 500,
              pages: pages.slice(0, 1),
            },
          ],
        })
      )
    ).not.toThrow();
  });

  it('rejects duplicate coloring book and page references used by recovery', () => {
    const archiveBook = {
      ref: 'coloring-book:duplicate-book' as const,
      oldId: 'duplicate-book',
      title: 'Duplicate reference',
      isMystery: false,
      status: 'in_stash' as const,
      totalPages: 2,
      tags: [],
      pages: [],
    };

    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [archiveBook, { ...archiveBook, oldId: 'other-book' }],
        })
      )
    ).toThrow(/duplicate coloring book reference/i);

    const duplicatePageRef = archiveColoringPage(1).ref;
    expect(() =>
      validateArchiveManifest(
        validManifest({
          coloringBooks: [
            {
              ...archiveBook,
              pages: [archiveColoringPage(1), { ...archiveColoringPage(2), ref: duplicatePageRef }],
            },
          ],
        })
      )
    ).toThrow(/duplicate coloring page reference/i);

    const archiveProject = {
      ref: 'project:duplicate-project' as const,
      oldId: 'duplicate-project',
      title: 'Duplicate project reference',
      status: 'purchased' as const,
      tags: [],
      progressNotes: [],
    };
    expect(() =>
      validateArchiveManifest(
        validManifest({
          diamondProjects: [archiveProject, { ...archiveProject, oldId: 'other-project' }],
        })
      )
    ).toThrow(/duplicate diamond project reference/i);

    expect(() =>
      validateArchiveManifest(
        validManifest({
          diamondProjects: [{ ...archiveProject, ref: 'constructor' as `project:${string}` }],
        })
      )
    ).toThrow(/invalid diamond project/i);
  });

  it('reports missing optional files as warnings', () => {
    const warnings = findMissingOptionalPhotoWarnings(
      validManifest({
        files: [
          {
            path: 'photos/projects/old-1/cover.jpg',
            role: 'project-cover',
            recordRef: 'project:old-1',
            field: 'image',
          },
        ],
      }),
      new Set(['manifest.json'])
    );

    expect(warnings).toEqual([
      {
        code: 'missing-photo-file',
        message:
          'Archive manifest references a photo that is not present: photos/projects/old-1/cover.jpg',
        path: 'photos/projects/old-1/cover.jpg',
      },
    ]);
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

  it('rejects invalid color counts while accepting older archives without them', () => {
    const project = {
      ref: 'project:old' as const,
      oldId: 'old',
      title: 'Older project',
      status: 'purchased' as const,
      tags: [],
      progressNotes: [],
    };
    expect(validateArchiveManifest(validManifest({ diamondProjects: [project] }))).toBeTruthy();
    expect(() =>
      validateArchiveManifest(
        validManifest({
          diamondProjects: [{ ...project, colorCount: -1 }],
        })
      )
    ).toThrow(/colorCount/i);
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

  it('accepts unchanged records returned in a different order', async () => {
    const first = {
      id: 'first',
      userId: 'user-1',
      title: 'First',
      status: 'purchased',
      createdAt: '',
      updatedAt: '',
    };
    const second = { ...first, id: 'second', title: 'Second' };
    serviceMocks.projectsService.getAllForUser
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second, first]);
    await expect(exportArchiveZip()).resolves.toMatchObject({ archiveSchemaVersion: 2 });
  });

  it('includes manifest, CSV files, and photo paths', async () => {
    const data: ArchiveExportSourceData = {
      projects: [
        {
          id: 'project-1',
          userId: 'user-1',
          title: 'Starry Fox',
          status: 'purchased',
          imageUrl: 'cover.jpg',
          createdAt: '',
          updatedAt: '',
        },
      ],
      projectProgressNotes: [
        {
          id: 'note-1',
          projectId: 'project-1',
          content: 'Progress photo',
          date: '2026-05-20',
          imageFilename: 'progress.jpg',
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringBooks: [
        {
          id: 'book-1',
          userId: 'user-1',
          title: 'Forest Animals',
          publisherId: 'publisher-1',
          illustratorId: 'illustrator-1',
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
          completedPages: 1,
          completionPercentage: 100,
          lastActivityAt: '',
          publisherName: 'Forest Press',
          illustratorName: 'Avery Lane',
          tags: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringPagesByBookId: {
        'book-1': [
          {
            id: 'page-1',
            bookId: 'book-1',
            pageNumber: 1,
            status: 'completed',
            photos: [],
            mediumIds: ['medium-1'],
            revealedSubject: 'Fox',
            revealedAt: '2026-05-17T16:20:00.000Z',
            startedAt: '2026-05-01',
            completedAt: '2026-05-02',
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
      coloringMediums: [
        {
          id: 'medium-1',
          userId: 'user-1',
          name: 'Colored pencil',
          type: 'colored_pencil',
          brand: '',
          colorCount: 0,
          notes: '',
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringPageProgressNotes: [
        {
          id: 'coloring-note-1',
          pageId: 'page-1',
          content: '',
          date: '2026-05-02',
          createdAt: '',
          updatedAt: '',
        },
      ],
    };
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(new Blob(['photo'], { type: 'image/jpeg' }), {
          status: 200,
        })
    );

    const { blob, manifest } = await createArchiveZipFromData(data, {
      exportedAt: '2026-05-20T00:00:00.000Z',
      fetchImpl,
    });
    const zip = await JSZip.loadAsync(blob);
    await expect(
      readOrganizedGlitterArchive(new File([blob], 'export.zip'))
    ).resolves.toMatchObject({
      manifest: { schemaVersion: 2 },
    });

    expect(zip.file('manifest.json')).toBeTruthy();
    expect(zip.file('diamond-projects.csv')).toBeTruthy();
    expect(zip.file('coloring-books.csv')).toBeTruthy();
    expect(zip.file('coloring-pages.csv')).toBeTruthy();
    expect(zip.file('photos/projects/project-1/cover.jpg')).toBeTruthy();
    expect(zip.file('photos/projects/project-1/progress-notes/note-1.jpg')).toBeTruthy();
    const coloringPagesCsv = await zip.file('coloring-pages.csv')?.async('string');
    expect(coloringPagesCsv).toContain(
      'Forest Animals,Forest Press,Avery Lane,1,completed,Colored pencil,Fox,2026-05-17,2026-05-01,2026-05-02,0,1'
    );
    expect(manifest.files[0]).toMatchObject({
      path: 'photos/projects/project-1/cover.jpg',
      role: 'project-cover',
    });
    expect(manifest.coloringMediums[0]).toMatchObject({
      ref: 'coloring-medium:medium-1',
      name: 'Colored pencil',
    });
    expect(manifest.coloringBooks[0].pages[0].mediumRefs).toEqual(['coloring-medium:medium-1']);
    expect(serviceMocks.archiveFilesService.getPrivateFileToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://pb.example/api/files/projects/project-1/cover.jpg?token=private-file-token'
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://pb.example/api/files/progress_notes/note-1/progress.jpg?token=private-file-token'
    );
  });

  it('fetches archive files with bounded concurrency instead of one at a time', async () => {
    const photoCount = 9;
    const data: ArchiveExportSourceData = {
      projects: [],
      projectProgressNotes: [],
      coloringMediums: [],
      coloringPageProgressNotes: [],
      coloringBooks: [
        {
          id: 'book-1',
          userId: 'user-1',
          title: 'Concurrency fixture',
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
          totalPages: photoCount,
          createdAt: '',
          updatedAt: '',
        },
      ],
      coloringPagesByBookId: {
        'book-1': Array.from({ length: photoCount }, (_, index) =>
          makeColoringPage({
            id: `page-${index + 1}`,
            bookId: 'book-1',
            pageNumber: index + 1,
            photos: [`photo-${index + 1}.jpg`],
          })
        ),
      },
    };

    const pendingResolvers: Array<() => void> = [];
    const fetchImpl = vi.fn().mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          pendingResolvers.push(() =>
            resolve(new Response(new Blob(['photo'], { type: 'image/jpeg' }), { status: 200 }))
          );
        })
    );

    const resultPromise = createArchiveZipFromData(data, {
      exportedAt: '2026-05-20T00:00:00.000Z',
      fetchImpl,
    });

    // Proves fetches run in a bounded pool (default 6) rather than serially: several
    // requests are in flight concurrently before any of them resolve.
    await vi.waitFor(() => expect(pendingResolvers.length).toBe(6));
    expect(fetchImpl).toHaveBeenCalledTimes(6);

    for (let resolved = 0; resolved < photoCount; resolved += 1) {
      await vi.waitFor(() => expect(pendingResolvers.length).toBeGreaterThan(0));
      pendingResolvers.shift()?.();
    }

    const { manifest } = await resultPromise;
    expect(fetchImpl).toHaveBeenCalledTimes(photoCount);
    expect(manifest.files).toHaveLength(photoCount);
  });

  it('requests full expanded coloring data when loading archive export source data', async () => {
    serviceMocks.progressNotesService.listAllForUser.mockResolvedValue([
      {
        id: 'note-2',
        projectId: 'project-1',
        content: 'Second page note',
        date: '2026-05-21',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    serviceMocks.coloringService.listAllBooks.mockResolvedValue([
      {
        id: 'book-1',
        title: 'Forest Animals',
      },
      {
        id: 'book-2',
        title: 'Garden Animals',
      },
    ]);
    serviceMocks.coloringService.listAllPagesByBook.mockResolvedValue({
      'book-1': [
        {
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
        },
      ],
      'book-2': [
        {
          id: 'page-2',
          bookId: 'book-2',
          pageNumber: 2,
          status: 'completed',
          photos: [],
          mediumIds: [],
          revealedSubject: '',
          revealedAt: '',
          startedAt: '',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    serviceMocks.coloringPageProgressNotesService.listAllForUser.mockResolvedValue([
      {
        id: 'coloring-note-2',
        pageId: 'page-2',
        content: 'Second page coloring note',
        date: '2026-05-21',
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const data = await loadArchiveExportSourceData();

    expect(serviceMocks.progressNotesService.listAllForUser).toHaveBeenCalledWith({
      userId: 'user-1',
    });
    expect(serviceMocks.coloringService.listAllBooks).toHaveBeenCalledWith({
      userId: 'user-1',
      expand: COLORING_BOOK_METADATA_EXPAND,
    });
    expect(serviceMocks.coloringService.listAllPagesByBook).toHaveBeenCalledOnce();
    expect(serviceMocks.coloringService.listAllPagesByBook).toHaveBeenCalledWith('user-1', [
      'book-1',
      'book-2',
    ]);
    expect(serviceMocks.coloringPageProgressNotesService.listAllForUser).toHaveBeenCalledWith({
      userId: 'user-1',
    });
    expect(data.coloringBooks.map(book => book.id)).toEqual(['book-1', 'book-2']);
    expect(data.coloringPagesByBookId['book-2'][0].id).toBe('page-2');
    expect(data.projectProgressNotes[0].id).toBe('note-2');
    expect(data.coloringPageProgressNotes[0].id).toBe('coloring-note-2');
  });

  it('fails archive export clearly when private file token retrieval fails', async () => {
    serviceMocks.archiveFilesService.getPrivateFileToken.mockResolvedValue('');
    const data: ArchiveExportSourceData = {
      projects: [
        {
          id: 'project-1',
          userId: 'user-1',
          title: 'Starry Fox',
          status: 'purchased',
          imageUrl: 'cover.jpg',
          createdAt: '',
          updatedAt: '',
        },
      ],
      projectProgressNotes: [],
      coloringBooks: [],
      coloringPagesByBookId: {},
      coloringMediums: [],
      coloringPageProgressNotes: [],
    };
    const fetchImpl = vi.fn();

    await expect(createArchiveZipFromData(data, { fetchImpl })).rejects.toThrow(
      /private file token/i
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        $exception_source: 'archive_export',
        operation: 'get_private_file_token',
        archive_schema_version: 2,
        status: 'failed',
        surface: 'settings_data',
      })
    );
  });

  it('normalizes rejected private file token requests during archive export', async () => {
    serviceMocks.archiveFilesService.getPrivateFileToken.mockRejectedValue(
      new Error('PocketBase token failed')
    );
    const data: ArchiveExportSourceData = {
      projects: [
        {
          id: 'project-1',
          userId: 'user-1',
          title: 'Starry Fox',
          status: 'purchased',
          imageUrl: 'cover.jpg',
          createdAt: '',
          updatedAt: '',
        },
      ],
      projectProgressNotes: [],
      coloringBooks: [],
      coloringPagesByBookId: {},
      coloringMediums: [],
      coloringPageProgressNotes: [],
    };
    const fetchImpl = vi.fn();

    await expect(createArchiveZipFromData(data, { fetchImpl })).rejects.toThrow(
      /private file token/i
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('archive import', () => {
  it('rejects excessive declared entries before JSZip loads them', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(validManifest()));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const end = bytes.length - 22;
    const directory = new DataView(bytes.buffer);
    directory.setUint16(end + 8, 10_001, true);
    directory.setUint16(end + 10, 10_001, true);
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    try {
      await expect(readOrganizedGlitterArchive(new File([bytes], 'bad.zip'))).rejects.toThrow(
        /too many entries/i
      );
      expect(loadAsync).not.toHaveBeenCalled();
    } finally {
      loadAsync.mockRestore();
    }
  });

  it('rejects an ambiguous ZIP comment before JSZip loads entries', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(validManifest()));
    const base = await zip.generateAsync({ type: 'uint8array' });
    const bytes = new Uint8Array(base.length + 23);
    bytes.set(base);
    new DataView(bytes.buffer).setUint16(base.length - 2, 23, true);
    bytes.set([0x50, 0x4b, 0x05, 0x06], base.length);
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    try {
      await expect(readOrganizedGlitterArchive(new File([bytes], 'ambiguous.zip'))).rejects.toThrow(
        /invalid central directory/i
      );
      expect(loadAsync).not.toHaveBeenCalled();
    } finally {
      loadAsync.mockRestore();
    }
  });

  it('rejects a compressed photo bomb before reading the manifest', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(validManifest()));
    zip.file('photos/bomb.jpg', 'a'.repeat(1024 * 1024));
    const file = new File(
      [await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })],
      'bomb.zip'
    );

    await expect(readOrganizedGlitterArchive(file)).rejects.toThrow(/compression ratio/i);
  });

  it('rejects oversized archive ZIP files before reading entries', async () => {
    const file = new File(['not a zip'], 'archive.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', {
      value: IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES + 1,
      configurable: true,
    });

    await expect(readOrganizedGlitterArchive(file)).rejects.toThrow(/zip file exceeds/i);
  });

  it('reads invalid archives without mutating', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ ...validManifest(), schemaVersion: 3 }));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'archive.zip');

    await expect(readOrganizedGlitterArchive(file)).rejects.toThrow(/unsupported archive schema/i);
  });

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

  it('keeps archived diamond projects distinct when their title and source URL match', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:old-project-1',
          oldId: 'old-project-1',
          title: 'Shared kit',
          sourceUrl: 'https://example.com/shared-kit',
          status: 'completed',
          tags: ['First'],
          progressNotes: [],
        },
        {
          ref: 'project:old-project-2',
          oldId: 'old-project-2',
          title: 'Shared kit',
          sourceUrl: 'https://example.com/shared-kit',
          status: 'progress',
          tags: ['Second'],
          progressNotes: [],
        },
      ],
    });
    const existingProjects: Array<{ id: string; title: string; sourceUrl?: string }> = [
      {
        id: 'existing-project',
        title: 'Shared kit',
        sourceUrl: 'https://example.com/shared-kit',
      },
    ];
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockImplementation(async () => [...existingProjects]),
      createDiamondProject: vi.fn().mockImplementation(async (project, _coverFile, projectId) => {
        const created = {
          id: projectId!,
          title: project.title,
          sourceUrl: project.sourceUrl,
        };
        existingProjects.push(created);
        return created;
      }),
    });
    const bundle = {
      zip: new JSZip(),
      manifest,
      warnings: [],
      archiveFingerprint: 'a'.repeat(64),
    };
    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'distinct-projects-test',
      null
    );

    const result = await importArchiveBundle(bundle, adapter, recoveryStore);
    const restoredProjectId = result.refMap['project:old-project-2'];

    expect(result.errors).toEqual([]);
    expect(result.matchedExistingRecordCount).toBe(1);
    expect(result.createdProjectCount).toBe(1);
    expect(result.refMap).toMatchObject({
      'project:old-project-1': 'existing-project',
      'project:old-project-2': restoredProjectId,
    });
    expect(restoredProjectId).toMatch(/^[a-z0-9]{15}$/);
    expect(adapter.createDiamondProject).toHaveBeenCalledOnce();
    expect(adapter.createDiamondProject).toHaveBeenCalledWith(
      manifest.diamondProjects[1],
      undefined,
      restoredProjectId
    );
    expect(adapter.addDiamondTags).toHaveBeenCalledWith(restoredProjectId, ['Second']);

    existingProjects.reverse();
    const retryResult = await importArchiveBundle(bundle, adapter, recoveryStore);

    expect(retryResult.errors).toEqual([]);
    expect(retryResult.matchedExistingRecordCount).toBe(2);
    expect(retryResult.createdProjectCount).toBe(0);
    expect(retryResult.refMap).toMatchObject(result.refMap);
    expect(adapter.createDiamondProject).toHaveBeenCalledOnce();
    expect(adapter.addDiamondTags).toHaveBeenCalledOnce();
  });

  it('retries missing tags for an archive-created diamond project', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:tag-retry',
          oldId: 'tag-retry',
          title: 'Tag retry',
          status: 'purchased',
          tags: ['Retry'],
          progressNotes: [],
        },
      ],
    });
    const existingProjects: Array<{ id: string; title: string; sourceUrl?: string }> = [];
    const addDiamondTags = vi
      .fn()
      .mockRejectedValueOnce(new Error('Tag request failed'))
      .mockResolvedValueOnce(undefined);
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockImplementation(async () => [...existingProjects]),
      createDiamondProject: vi.fn().mockImplementation(async (project, _coverFile, projectId) => {
        const created = { id: projectId!, title: project.title, sourceUrl: project.sourceUrl };
        existingProjects.push(created);
        return created;
      }),
      addDiamondTags,
    });
    const bundle = {
      zip: new JSZip(),
      manifest,
      warnings: [],
      archiveFingerprint: 'b'.repeat(64),
    };
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'tag-retry-test', null);

    const firstResult = await importArchiveBundle(bundle, adapter, recoveryStore);
    const retryResult = await importArchiveBundle(bundle, adapter, recoveryStore);

    expect(firstResult.success).toBe(false);
    expect(firstResult.errors).toEqual(['Tag request failed']);
    expect(retryResult.success).toBe(true);
    expect(retryResult.matchedExistingRecordCount).toBe(1);
    expect(adapter.createDiamondProject).toHaveBeenCalledOnce();
    expect(addDiamondTags).toHaveBeenCalledTimes(2);
    expect(recoveryStore.getProject('project:tag-retry')).toMatchObject({
      creationConfirmed: true,
      tagsRestored: true,
    });
  });

  it('matches canonically equivalent Unicode project titles', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:cafe',
          oldId: 'cafe',
          title: 'Caf\u00e9',
          sourceUrl: 'https://example.com/cafe',
          status: 'purchased',
          tags: [],
          progressNotes: [],
        },
      ],
    });
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockResolvedValue([
        {
          id: 'existing-cafe',
          title: 'Cafe\u0301',
          sourceUrl: 'https://example.com/cafe',
        },
      ]),
    });

    const result = await importArchiveBundle({ zip: new JSZip(), manifest, warnings: [] }, adapter);

    expect(result.success).toBe(true);
    expect(result.matchedExistingRecordCount).toBe(1);
    expect(result.refMap['project:cafe']).toBe('existing-cafe');
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
  });

  it('reports ambiguous existing diamond projects without merging them', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:ambiguous',
          oldId: 'ambiguous',
          title: 'Same kit',
          sourceUrl: 'https://example.com/same-kit',
          status: 'purchased',
          tags: [],
          progressNotes: [],
        },
      ],
    });
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockResolvedValue([
        { id: 'same-1', title: 'Same kit', sourceUrl: 'https://example.com/same-kit' },
        { id: 'same-2', title: 'Same kit', sourceUrl: 'https://example.com/same-kit' },
      ]),
    });

    const result = await importArchiveBundle({ zip: new JSZip(), manifest, warnings: [] }, adapter);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      'Archive project project:ambiguous ("Same kit") matches multiple existing diamond projects. None were merged.',
    ]);
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
    expect(result.refMap['project:ambiguous']).toBeUndefined();
  });

  it('keeps persisted project mappings stable when existing result order changes', async () => {
    const values = new Map<string, string>([
      [
        'og:archive-import-recovery:v2:user-1:persisted-projects:project:project%3Aone',
        JSON.stringify({
          projectId: 'existing-1',
          isArchiveCreated: false,
          creationConfirmed: true,
          tagsRestored: true,
          expiresAt: Date.now() + 60_000,
        }),
      ],
      [
        'og:archive-import-recovery:v2:user-1:persisted-projects:project:project%3Atwo',
        JSON.stringify({
          projectId: 'existing-2',
          isArchiveCreated: false,
          creationConfirmed: true,
          tagsRestored: true,
          expiresAt: Date.now() + 60_000,
        }),
      ],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    } as unknown as Storage;
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:one',
          oldId: 'one',
          title: 'Same kit',
          status: 'purchased',
          tags: [],
          progressNotes: [],
        },
        {
          ref: 'project:two',
          oldId: 'two',
          title: 'Same kit',
          status: 'progress',
          tags: [],
          progressNotes: [],
        },
      ],
    });
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockResolvedValue([
        { id: 'existing-2', title: 'Same kit' },
        { id: 'existing-1', title: 'Same kit' },
      ]),
    });
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'persisted-projects', storage);

    const result = await importArchiveBundle(
      { zip: new JSZip(), manifest, warnings: [] },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(true);
    expect(result.refMap).toMatchObject({
      'project:one': 'existing-1',
      'project:two': 'existing-2',
    });
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
  });

  it('confirms a pending project checkpoint after an ambiguous create response', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:pending',
          oldId: 'pending',
          title: 'Pending project',
          status: 'purchased',
          tags: [],
          progressNotes: [],
        },
      ],
    });
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'pending-project', null);
    recoveryStore.saveProject('project:pending', {
      projectId: 'pending-project',
      isArchiveCreated: true,
      creationConfirmed: false,
      tagsRestored: false,
    });
    const adapter = makeImportAdapter({
      listExistingProjects: vi
        .fn()
        .mockResolvedValue([{ id: 'pending-project', title: 'Pending project' }]),
    });

    const result = await importArchiveBundle(
      { zip: new JSZip(), manifest, warnings: [] },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(true);
    expect(recoveryStore.getProject('project:pending')).toMatchObject({
      projectId: 'pending-project',
      creationConfirmed: true,
      tagsRestored: true,
    });
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
  });

  it('reports an archive identity conflict instead of merging diamond projects', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:old-project',
          oldId: 'old-project',
          title: 'Archived project',
          sourceUrl: 'https://example.com/archived',
          status: 'purchased',
          tags: [],
          progressNotes: [],
        },
      ],
    });
    const adapter = makeImportAdapter({
      listExistingProjects: vi.fn().mockResolvedValue([
        {
          id: 'archive-project',
          title: 'Unrelated project',
          sourceUrl: 'https://example.com/unrelated',
        },
      ]),
    });
    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'identity-conflict-test',
      null
    );
    recoveryStore.saveProject('project:old-project', {
      projectId: 'archive-project',
      isArchiveCreated: true,
      creationConfirmed: true,
      tagsRestored: true,
    });

    const result = await importArchiveBundle(
      { zip: new JSZip(), manifest, warnings: [], archiveFingerprint: 'a'.repeat(64) },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      'Archive identity project:old-project for "Archived project" conflicts with an existing diamond project. The records were not merged.',
    ]);
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
    expect(adapter.addDiamondTags).not.toHaveBeenCalled();
    expect(result.refMap['project:old-project']).toBeUndefined();
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

  it('serializes concurrent imports for the same archive', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const first = withArchiveImportLock(
      'same-archive',
      async () => {
        events.push('first-start');
        await firstCanFinish;
        events.push('first-end');
      },
      null
    );
    const second = withArchiveImportLock(
      'same-archive',
      async () => {
        events.push('second-start');
      },
      null
    );

    await vi.waitFor(() => expect(events).toEqual(['first-start']));
    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('preserves edited metadata while restoring missing children under a matched book', async () => {
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'project:old-project',
          oldId: 'old-project',
          title: 'Retry Project',
          status: 'purchased',
          tags: ['Retry'],
          progressNotes: [
            {
              ref: 'project-note:old-note',
              oldId: 'old-note',
              content: 'Recovered project note',
              date: '2024-05-10',
            },
          ],
        },
      ],
      coloringBooks: [
        {
          ref: 'coloring-book:old-book',
          oldId: 'old-book',
          title: 'Retry Book',
          publisher: 'Press',
          illustrator: 'Artist',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: ['Retry'],
          pages: [
            {
              ref: 'coloring-page:old-page',
              oldId: 'old-page',
              pageNumber: 1,
              status: 'completed',
              mediumRefs: [],
              photoPaths: [],
              progressNotes: [
                {
                  ref: 'coloring-page-note:old-page-note',
                  oldId: 'old-page-note',
                  content: 'Recovered page note',
                  date: '2024-05-11',
                },
              ],
            },
          ],
        },
      ],
    });
    const adapter: ArchiveImportAdapter = {
      listExistingProjects: vi
        .fn()
        .mockResolvedValue([{ id: 'current-project', title: 'Retry Project' }]),
      createDiamondProject: vi.fn(),
      addDiamondTags: vi.fn(),
      listDiamondProgressNotes: vi.fn().mockResolvedValue([]),
      createDiamondProgressNote: vi.fn().mockResolvedValue({ id: 'current-project-note' }),
      listExistingColoringBooks: vi.fn().mockResolvedValue([
        {
          id: 'current-book',
          title: 'Retry Book',
          publisher: 'Press',
          illustrator: 'Artist',
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
          status: 'in_progress',
          photos: [],
          mediumIds: [],
          revealedSubject: 'Current subject',
          revealedAt: '2026-06-01T00:00:00.000Z',
          startedAt: '2026-06-01',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ]),
      restoreColoringPageMetadata: vi.fn().mockResolvedValue({
        id: 'current-page',
        bookId: 'current-book',
        pageNumber: 1,
        status: 'completed',
        photos: [],
        mediumIds: [],
        revealedSubject: '',
        revealedAt: '',
        startedAt: '',
        completedAt: '',
        createdAt: '',
        updatedAt: '',
      }),
      appendColoringPagePhotos: vi.fn(),
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn().mockResolvedValue({ id: 'current-page-note' }),
    };

    const result = await importArchiveBundle({ zip: new JSZip(), manifest, warnings: [] }, adapter);

    expect(result.matchedExistingRecordCount).toBe(2);
    expect(adapter.createDiamondProject).not.toHaveBeenCalled();
    expect(adapter.addDiamondTags).not.toHaveBeenCalled();
    expect(adapter.createColoringBook).not.toHaveBeenCalled();
    expect(adapter.createDiamondProgressNote).toHaveBeenCalledWith(
      'current-project',
      { content: 'Recovered project note', date: '2024-05-10' },
      undefined
    );
    expect(adapter.restoreColoringPageMetadata).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.skippedRecordCount).toBe(1);
    expect(result.warnings).toContainEqual({
      code: 'coloring-page-metadata-conflict',
      message:
        'Page 1 in Retry Book: current metadata differs from the archive and no safe restore checkpoint matches it',
      recordRef: 'coloring-page:old-page',
    });
    expect(adapter.appendColoringPagePhotos).not.toHaveBeenCalled();
    expect(adapter.createColoringPageProgressNote).toHaveBeenCalledWith(
      'current-page',
      { content: 'Recovered page note', date: '2024-05-11' },
      undefined
    );
    expect(result.refMap).toMatchObject({
      'project:old-project': 'current-project',
      'project-note:old-note': 'current-project-note',
      'coloring-book:old-book': 'current-book',
      'coloring-page:old-page': 'current-page',
      'coloring-page-note:old-page-note': 'current-page-note',
    });
  });

  it('resumes failed coloring page metadata without duplicating the book', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:old-book',
          oldId: 'old-book',
          title: 'Retry Book',
          isMystery: true,
          status: 'in_progress',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:old-page',
              oldId: 'old-page',
              pageNumber: 1,
              status: 'completed',
              mediumRefs: [],
              revealedSubject: 'Fox',
              revealedAt: '2026-05-17T16:20:00.000Z',
              startedAt: '2026-05-01',
              completedAt: '2026-05-02',
              photoPaths: ['photos/coloring-books/old-book/pages/1/retry.jpg'],
              progressNotes: [],
            },
          ],
        },
      ],
    });
    const books: Array<{ id: string; title: string }> = [];
    let page = {
      id: 'new-page',
      bookId: 'new-book',
      pageNumber: 1,
      status: 'not_started' as const,
      photos: [],
      mediumIds: [],
      revealedSubject: '',
      revealedAt: '',
      startedAt: '',
      completedAt: '',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    };
    const restoreColoringPageMetadata = vi
      .fn()
      .mockRejectedValueOnce(new Error('Metadata update failed'))
      .mockImplementation(async () => {
        page = {
          ...page,
          status: 'completed',
          revealedSubject: 'Fox',
          revealedAt: '2026-05-17T16:20:00.000Z',
          startedAt: '2026-05-01',
          completedAt: '2026-05-02',
          updatedAt: '2026-09-05T12:01:00.000Z',
        };
        return page;
      });
    const zip = new JSZip();
    zip.file('photos/coloring-books/old-book/pages/1/retry.jpg', new Blob(['page']));
    const adapter: ArchiveImportAdapter = {
      listExistingProjects: vi.fn().mockResolvedValue([]),
      createDiamondProject: vi.fn(),
      addDiamondTags: vi.fn(),
      listDiamondProgressNotes: vi.fn(),
      createDiamondProgressNote: vi.fn(),
      listExistingColoringBooks: vi.fn().mockImplementation(async () => [...books]),
      createColoringBook: vi.fn().mockImplementation(async book => {
        books.push({ id: 'new-book', title: book.title });
        return {
          id: 'new-book',
          userId: 'user-1',
          title: book.title,
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
          isMystery: book.isMystery,
          status: book.status,
          totalPages: book.totalPages,
          createdAt: '',
          updatedAt: '',
        };
      }),
      addColoringBookTags: vi.fn(),
      listColoringMediums: vi.fn().mockResolvedValue([]),
      createColoringMedium: vi.fn(),
      listColoringPages: vi.fn().mockImplementation(async () => [{ ...page }]),
      restoreColoringPageMetadata,
      appendColoringPagePhotos: vi.fn().mockImplementation(async () => {
        page = {
          ...page,
          photos: ['retry.jpg'],
          updatedAt: '2026-09-05T12:02:00.000Z',
        };
        return page;
      }),
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn(),
    };
    const bundle = { zip, manifest, warnings: [] };
    const unavailableStorage = {
      getItem() {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      },
      setItem() {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      },
      removeItem() {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      },
    } as unknown as Storage;
    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'failed-coloring-page-metadata-test',
      unavailableStorage
    );

    const firstResult = await importArchiveBundle(bundle, adapter, recoveryStore);
    const retryResult = await importArchiveBundle(bundle, adapter, recoveryStore);

    expect(firstResult.success).toBe(false);
    expect(retryResult.errors).toEqual([]);
    expect(retryResult.success).toBe(true);
    expect(adapter.createColoringBook).toHaveBeenCalledTimes(1);
    expect(restoreColoringPageMetadata).toHaveBeenCalledTimes(2);
    expect(adapter.appendColoringPagePhotos).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({
      status: 'completed',
      revealedSubject: 'Fox',
      revealedAt: '2026-05-17T16:20:00.000Z',
      startedAt: '2026-05-01',
      completedAt: '2026-05-02',
    });
  });

  it('recognizes metadata that landed before an ambiguous response failure', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:ambiguous-book',
          oldId: 'ambiguous-book',
          title: 'Ambiguous Retry Book',
          isMystery: false,
          status: 'in_progress',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:ambiguous-page',
              oldId: 'ambiguous-page',
              pageNumber: 1,
              status: 'completed',
              mediumRefs: [],
              completedAt: '2026-05-02',
              photoPaths: [],
              progressNotes: [],
            },
          ],
        },
      ],
    });
    const books: Array<{ id: string; title: string }> = [];
    let page = {
      id: 'ambiguous-new-page',
      bookId: 'ambiguous-new-book',
      pageNumber: 1,
      status: 'not_started' as 'not_started' | 'completed',
      photos: [],
      mediumIds: [],
      revealedSubject: '',
      revealedAt: '',
      startedAt: '',
      completedAt: '',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    };
    const restoreColoringPageMetadata = vi.fn().mockImplementation(async () => {
      page = {
        ...page,
        status: 'completed',
        completedAt: '2026-05-02',
        updatedAt: '2026-09-05T12:01:00.000Z',
      };
      throw new Error('Response was lost');
    });
    const adapter: ArchiveImportAdapter = {
      listExistingProjects: vi.fn().mockResolvedValue([]),
      createDiamondProject: vi.fn(),
      addDiamondTags: vi.fn(),
      listDiamondProgressNotes: vi.fn(),
      createDiamondProgressNote: vi.fn(),
      listExistingColoringBooks: vi.fn().mockImplementation(async () => [...books]),
      createColoringBook: vi.fn().mockImplementation(async book => {
        books.push({ id: 'ambiguous-new-book', title: book.title });
        return {
          id: 'ambiguous-new-book',
          userId: 'user-1',
          title: book.title,
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
          isMystery: book.isMystery,
          status: book.status,
          totalPages: book.totalPages,
          createdAt: '',
          updatedAt: '',
        };
      }),
      addColoringBookTags: vi.fn(),
      listColoringMediums: vi.fn().mockResolvedValue([]),
      createColoringMedium: vi.fn(),
      listColoringPages: vi.fn().mockImplementation(async () => [{ ...page }]),
      restoreColoringPageMetadata,
      appendColoringPagePhotos: vi.fn(),
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn(),
    };
    const bundle = { zip: new JSZip(), manifest, warnings: [] };
    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'ambiguous-coloring-page-metadata-test',
      null
    );

    const firstResult = await importArchiveBundle(bundle, adapter, recoveryStore);
    const retryResult = await importArchiveBundle(bundle, adapter, recoveryStore);

    expect(firstResult.success).toBe(false);
    expect(retryResult.success).toBe(true);
    expect(adapter.createColoringBook).toHaveBeenCalledTimes(1);
    expect(restoreColoringPageMetadata).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({ status: 'completed', completedAt: '2026-05-02' });
  });

  it('continues importing later coloring pages when one page photo append fails', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:old-book',
          oldId: 'old-book',
          title: 'Retry Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 2,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:old-page-1',
              oldId: 'old-page-1',
              pageNumber: 1,
              status: 'completed',
              mediumRefs: [],
              photoPaths: ['photos/coloring-books/old-book/pages/1/1.jpg'],
              progressNotes: [],
            },
            {
              ref: 'coloring-page:old-page-2',
              oldId: 'old-page-2',
              pageNumber: 2,
              status: 'completed',
              mediumRefs: [],
              photoPaths: ['photos/coloring-books/old-book/pages/2/1.jpg'],
              progressNotes: [],
            },
          ],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('photos/coloring-books/old-book/pages/1/1.jpg', new Blob(['first']));
    zip.file('photos/coloring-books/old-book/pages/2/1.jpg', new Blob(['second']));
    const appendColoringPagePhotos = vi
      .fn()
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({
        id: 'current-page-2',
        bookId: 'current-book',
        pageNumber: 2,
        status: 'completed',
        photos: ['1.jpg'],
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
          id: 'current-page-1',
          bookId: 'current-book',
          pageNumber: 1,
          status: 'completed',
          photos: [],
          mediumIds: [],
          revealedSubject: '',
          revealedAt: '',
          startedAt: '',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'current-page-2',
          bookId: 'current-book',
          pageNumber: 2,
          status: 'completed',
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
      restoreColoringPageMetadata: vi.fn(),
      appendColoringPagePhotos,
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn(),
    };

    const result = await importArchiveBundle({ zip, manifest, warnings: [] }, adapter);

    expect(result.success).toBe(false);
    expect(result.importedPhotoCount).toBe(1);
    expect(result.errors).toEqual(['Page 1 in Retry Book: Upload failed']);
    expect(appendColoringPagePhotos).toHaveBeenCalledTimes(2);
    expect(appendColoringPagePhotos).toHaveBeenNthCalledWith(1, 'current-page-1', [
      expect.objectContaining({ name: '1.jpg' }),
    ]);
    expect(appendColoringPagePhotos).toHaveBeenNthCalledWith(2, 'current-page-2', [
      expect.objectContaining({ name: '1.jpg' }),
    ]);
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

  it('uploads page photos in bounded batches and stops after a failed batch', async () => {
    const paths = Array.from({ length: 9 }, (_, index) => `photos/page/${index}.jpg`);
    const page = { ...archiveColoringPage(1), photoPaths: paths };
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:batch',
          oldId: 'batch',
          title: 'Batch Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [page],
        },
      ],
    });
    const zip = new JSZip();
    for (const path of paths) zip.file(path, new Blob(['photo']));
    const appendColoringPagePhotos = vi
      .fn()
      .mockResolvedValueOnce(makeColoringPage({ id: 'current-page', photos: paths.slice(0, 4) }))
      .mockRejectedValueOnce(new Error('Upload failed'));
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi
        .fn()
        .mockResolvedValue([{ id: 'current-book', title: 'Batch Book' }]),
      listColoringPages: vi
        .fn()
        .mockResolvedValue([
          makeColoringPage({ id: 'current-page', bookId: 'current-book', photos: [] }),
        ]),
      appendColoringPagePhotos,
    });

    const result = await importArchiveBundle({ zip, manifest, warnings: [] }, adapter);

    expect(result.importedPhotoCount).toBe(4);
    expect(result.errors).toContain('Page 1 in Batch Book: Upload failed');
    expect(appendColoringPagePhotos).toHaveBeenCalledTimes(2);
    expect(appendColoringPagePhotos.mock.calls.map(([, files]) => files.length)).toEqual([4, 4]);
  });

  it('resumes after a missing photo and failed batch without duplicating a photo', async () => {
    const paths = Array.from({ length: 9 }, (_, index) => `photos/page/${index}.jpg`);
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:retry',
          oldId: 'retry',
          title: 'Retry Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [{ ...archiveColoringPage(1), photoPaths: paths }],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    for (const path of paths.slice(1)) zip.file(path, new Blob(['photo']));
    const bundle = await readOrganizedGlitterArchive(
      new File([await zip.generateAsync({ type: 'blob' })], 'retry.zip')
    );
    const persistedPhotos: string[] = [];
    let appendCount = 0;
    const appendColoringPagePhotos = vi.fn(async (_pageId: string, files: File[]) => {
      appendCount += 1;
      if (appendCount === 2) throw new Error('Upload failed');
      persistedPhotos.push(...files.map(file => file.name));
      return makeColoringPage({ photos: [...persistedPhotos] });
    });
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi
        .fn()
        .mockResolvedValue([{ id: 'current-book', title: 'Retry Book' }]),
      listColoringPages: vi.fn().mockImplementation(async () => [
        makeColoringPage({
          id: 'current-page',
          bookId: 'current-book',
          photos: [...persistedPhotos],
        }),
      ]),
      appendColoringPagePhotos,
    });

    const first = await importArchiveBundle(bundle, adapter);
    const retry = await importArchiveBundle(bundle, adapter);

    expect(first.importedPhotoCount).toBe(4);
    expect(first.errors).toContain('Page 1 in Retry Book: Upload failed');
    expect(retry.importedPhotoCount).toBe(4);
    expect(persistedPhotos).toEqual(paths.slice(1).map(path => path.split('/').at(-1)));
    expect(retry.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-photo-file', path: paths[0] }),
      ])
    );
  });

  it('counts archived page photos skipped when the current page already has enough photos', async () => {
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
              status: 'in_progress',
              revealedSubject: 'Current subject',
              revealedAt: '2026-06-01T00:00:00.000Z',
              startedAt: '2026-06-01',
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
          status: 'in_progress',
          photos: ['existing-1.jpg', 'existing-2.jpg'],
          mediumIds: [],
          revealedSubject: 'Current subject',
          revealedAt: '2026-06-01T00:00:00.000Z',
          startedAt: '2026-06-01',
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ]),
      restoreColoringPageMetadata: vi.fn(),
      appendColoringPagePhotos: vi.fn(),
      listColoringPageProgressNotes: vi.fn().mockResolvedValue([]),
      createColoringPageProgressNote: vi.fn(),
    };

    const zip = new JSZip();
    zip.file('photos/coloring-books/old-book/pages/1/1.jpg', new Blob(['first']));
    zip.file('photos/coloring-books/old-book/pages/1/2.jpg', new Blob(['second']));
    const result = await importArchiveBundle({ zip, manifest, warnings: [] }, adapter);

    expect(result.importedPhotoCount).toBe(0);
    expect(result.skippedRecordCount).toBe(2);
    expect(result.skippedPagePhotoCount).toBe(2);
    expect(result.warnings).toContainEqual({
      code: 'skipped-existing-coloring-page-photos',
      message: 'Page 1: skipped 2 of 2 archived photos because this page already has 2 photos',
      recordRef: 'coloring-page:old-page',
    });
    expect(adapter.restoreColoringPageMetadata).not.toHaveBeenCalled();
    expect(adapter.appendColoringPagePhotos).not.toHaveBeenCalled();
  });

  it('maps archive coloring mediums by current-account name before creating missing mediums', async () => {
    const manifest = validManifest({
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
    });
    const adapter: ArchiveImportAdapter = {
      listExistingProjects: vi.fn().mockResolvedValue([]),
      createDiamondProject: vi.fn(),
      addDiamondTags: vi.fn(),
      listDiamondProgressNotes: vi.fn(),
      createDiamondProgressNote: vi.fn(),
      listExistingColoringBooks: vi.fn().mockResolvedValue([]),
      createColoringBook: vi.fn(),
      addColoringBookTags: vi.fn(),
      listColoringMediums: vi.fn().mockResolvedValue([
        {
          id: 'current-medium',
          userId: 'user-1',
          name: 'Colored pencil',
          type: 'colored_pencil',
          brand: '',
          colorCount: 0,
          notes: '',
          createdAt: '',
          updatedAt: '',
        },
      ]),
      createColoringMedium: vi.fn(),
      listColoringPages: vi.fn(),
      restoreColoringPageMetadata: vi.fn(),
      appendColoringPagePhotos: vi.fn(),
      listColoringPageProgressNotes: vi.fn(),
      createColoringPageProgressNote: vi.fn(),
    };

    const result = await importArchiveBundle({ zip: new JSZip(), manifest, warnings: [] }, adapter);

    expect(adapter.createColoringMedium).not.toHaveBeenCalled();
    expect(result.refMap).toMatchObject({
      'coloring-medium:old-medium': 'current-medium',
    });
  });

  it('skips duplicate coloring books using expanded publisher and illustrator metadata', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:old-book',
          oldId: 'old-book',
          title: 'Forest Animals',
          publisher: 'Forest Press',
          illustrator: 'Avery Lane',
          isMystery: false,
          status: 'in_stash',
          totalPages: 12,
          tags: [],
          pages: [],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'archive.zip');

    serviceMocks.coloringService.listAllBooks.mockResolvedValue([
      {
        id: 'current-book',
        title: 'Forest Animals',
        publisherName: 'Forest Press',
        illustratorName: 'Avery Lane',
      },
    ]);

    const result = await importOrganizedGlitterArchive(file);

    expect(navigator.locks.request).toHaveBeenCalledWith(
      'organized-glitter:archive-import:user-1',
      expect.any(Function)
    );
    expect(result.matchedExistingRecordCount).toBe(1);
    expect(result.createdColoringBookCount).toBe(0);
    expect(serviceMocks.coloringService.createBook).not.toHaveBeenCalled();
    expect(serviceMocks.coloringService.listAllBooks).toHaveBeenCalledWith({
      userId: 'user-1',
      expand: COLORING_BOOK_METADATA_EXPAND,
    });
  });

  it.each([1, 2] as const)(
    'routes schema v%s diamond restores through the context-aware backend',
    async schemaVersion => {
      const manifest = validManifest({
        schemaVersion,
        diamondProjects: [
          {
            ref: 'project:legacy-project',
            oldId: 'legacy-project',
            title: 'Legacy project',
            status: 'progress',
            colorCount: 0,
            dateCompleted: '2025-03-01',
            tags: [],
            progressNotes: [],
          },
        ],
      });
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(manifest));
      const file = new File([await zip.generateAsync({ type: 'blob' })], 'legacy.zip');
      serviceMocks.archiveFilesService.restoreDiamondProject.mockImplementation(
        async (formData: FormData) => ({
          id: formData.get('id'),
          status: 'progress',
        })
      );

      const result = await importOrganizedGlitterArchive(file);

      expect(result.errors).toEqual([]);
      expect(result.refMap['project:legacy-project']).toMatch(/^[a-z0-9]{15}$/);
      expect(serviceMocks.archiveFilesService.restoreDiamondProject).toHaveBeenCalledOnce();
      const formData = serviceMocks.archiveFilesService.restoreDiamondProject.mock.calls[0][0];
      expect(formData.get('dateCompleted')).toBe('2025-03-01');
      expect(formData.get('status')).toBe('progress');
      expect(formData.get('colorCount')).toBe('0');
      expect(serviceMocks.projectsService.create).not.toHaveBeenCalled();
    }
  );

  it('resumes bounded coloring book generation after a later batch fails', async () => {
    const pages = Array.from({ length: 600 }, (_, index) => ({
      ref: `coloring-page:legacy-${index + 1}` as const,
      oldId: `legacy-${index + 1}`,
      pageNumber: index + 1,
      status: index === 599 ? ('in_progress' as const) : ('not_started' as const),
      mediumRefs: [],
      photoPaths: [],
      progressNotes: [],
    }));
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:legacy-book',
          oldId: 'legacy-book',
          title: 'Legacy Coloring Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 600,
          tags: [],
          pages,
        },
      ],
    });
    const manifestJson = JSON.stringify(manifest);
    const zip = new JSZip();
    zip.file('manifest.json', manifestJson);
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'legacy-backup.zip');
    const archiveFingerprint = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(manifestJson)
    );
    const fingerprint = Array.from(new Uint8Array(archiveFingerprint), byte =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    const bookId = await deriveArchiveColoringBookId(
      'user-1',
      fingerprint,
      'coloring-book:legacy-book'
    );
    const restoredPages = new Map<number, ReturnType<typeof makeColoringPage>>();
    let bookExists = false;
    let failSecondBatch = true;

    serviceMocks.coloringService.listAllBooks.mockImplementation(async () =>
      bookExists
        ? [
            {
              id: bookId,
              title: 'Legacy Coloring Book',
              publisherName: '',
              illustratorName: '',
              tags: [],
            },
          ]
        : []
    );
    serviceMocks.archiveFilesService.restoreColoringBookBatch.mockImplementation(
      async (formData: FormData) => {
        const firstPage = Number(formData.get('firstPage'));
        const pageCount = Number(formData.get('pageCount'));
        if (failSecondBatch && firstPage === 101) {
          failSecondBatch = false;
          throw new Error('batch interrupted');
        }
        const created = !bookExists;
        bookExists = true;
        const batchPages = Array.from({ length: pageCount }, (_, index) => {
          const pageNumber = firstPage + index;
          const page =
            restoredPages.get(pageNumber) ??
            makeColoringPage({
              id: `page-${pageNumber}`,
              bookId,
              pageNumber,
              createdAt: '2026-09-05T12:00:00.000Z',
              updatedAt: '2026-09-05T12:00:00.000Z',
            });
          restoredPages.set(pageNumber, page);
          return page;
        });
        return { bookId, created, pages: batchPages };
      }
    );
    serviceMocks.archiveFilesService.restoreColoringPageMetadata.mockResolvedValue(undefined);

    const firstResult = await importOrganizedGlitterArchive(file);
    const retryResult = await importOrganizedGlitterArchive(file);

    expect(firstResult.success).toBe(false);
    expect(firstResult.errors).toContain('batch interrupted');
    expect(retryResult.errors).toEqual([]);
    expect(retryResult.success).toBe(true);
    expect(retryResult.matchedExistingRecordCount).toBe(1);
    expect(retryResult.refMap['coloring-page:legacy-600']).toBe('page-600');
    expect(restoredPages).toHaveLength(600);
    expect(serviceMocks.coloringService.createBook).not.toHaveBeenCalled();
    expect(
      serviceMocks.archiveFilesService.restoreColoringBookBatch.mock.calls.map(([formData]) =>
        Number((formData as FormData).get('firstPage'))
      )
    ).toEqual([1, 101, 1, 101, 201, 301, 401, 501]);
    expect(
      serviceMocks.archiveFilesService.restoreColoringBookBatch.mock.calls.map(([formData]) =>
        (formData as FormData).get('allowCreate')
      )
    ).toEqual(['true', 'false', 'true', 'false', 'false', 'false', 'false', 'false']);
    const continuationPayloadKeys = Array.from(
      (
        serviceMocks.archiveFilesService.restoreColoringBookBatch.mock.calls.find(
          ([formData]) => Number((formData as FormData).get('firstPage')) === 101
        )?.[0] as FormData
      ).keys()
    ).sort();
    expect(continuationPayloadKeys).toEqual([
      'allowCreate',
      'archiveBookRef',
      'archiveFingerprint',
      'firstPage',
      'pageCount',
      'title',
      'totalPages',
    ]);
    expect(serviceMocks.archiveFilesService.restoreColoringPageMetadata).toHaveBeenCalledTimes(1);
    expect(serviceMocks.archiveFilesService.reconcileColoringBookMetrics).toHaveBeenCalledWith(
      bookId
    );
  });

  it('preserves a checkpointed page edited after a failed metadata request', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:checkpoint-book',
          oldId: 'checkpoint-book',
          title: 'Checkpoint Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:checkpoint-page',
              oldId: 'checkpoint-page',
              pageNumber: 1,
              status: 'in_progress',
              mediumRefs: [],
              photoPaths: [],
              progressNotes: [],
            },
          ],
        },
      ],
    });
    let bookExists = false;
    let currentPage = makeColoringPage({
      id: 'checkpoint-page-id',
      bookId: 'checkpoint-book-id',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    });
    const restoreColoringPageMetadata = vi.fn().mockImplementation(async () => {
      currentPage = {
        ...currentPage,
        revealedSubject: 'Independent edit',
        updatedAt: '2026-09-05T12:05:00.000Z',
      };
      throw Object.assign(new Error('archive restore conflict'), { status: 409 });
    });
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi
        .fn()
        .mockImplementation(async () =>
          bookExists ? [{ id: 'checkpoint-book-id', title: 'Checkpoint Book' }] : []
        ),
      createColoringBook: vi.fn().mockImplementation(async () => {
        bookExists = true;
        return { id: 'checkpoint-book-id', title: 'Checkpoint Book' };
      }),
      listColoringPages: vi.fn().mockImplementation(async () => [currentPage]),
      restoreColoringPageMetadata,
    });
    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'checkpoint-edit-after-failure'
    );

    const firstResult = await importArchiveBundle(
      { zip: new JSZip(), manifest, warnings: [] },
      adapter,
      recoveryStore
    );
    const retryResult = await importArchiveBundle(
      { zip: new JSZip(), manifest, warnings: [] },
      adapter,
      recoveryStore
    );

    expect(firstResult.success).toBe(false);
    expect(firstResult.warnings).toContainEqual(
      expect.objectContaining({ code: 'coloring-page-metadata-conflict' })
    );
    expect(retryResult.success).toBe(false);
    expect(retryResult.warnings).toContainEqual(
      expect.objectContaining({ code: 'coloring-page-metadata-conflict' })
    );
    expect(currentPage.revealedSubject).toBe('Independent edit');
    expect(restoreColoringPageMetadata).toHaveBeenCalledTimes(1);
  });

  it('resumes the deterministic archive book instead of a later natural-key match', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:pending-book',
          oldId: 'pending-book',
          title: 'Same Title',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:pending-page',
              oldId: 'pending-page',
              pageNumber: 1,
              status: 'in_progress',
              mediumRefs: [],
              photoPaths: [],
              progressNotes: [],
            },
          ],
        },
      ],
    });
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'pending-provenance-test');
    recoveryStore.saveBook('coloring-book:pending-book', {
      bookId: 'archivebookid01',
      pages: {},
    });
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi
        .fn()
        .mockResolvedValue([{ id: 'independent01', title: 'Same Title' }]),
      getArchiveColoringBookId: vi.fn().mockResolvedValue('archivebookid01'),
      restoreArchiveColoringBook: vi.fn().mockResolvedValue({
        bookId: 'archivebookid01',
        created: false,
        pages: [
          makeColoringPage({
            id: 'archivepage01',
            bookId: 'archivebookid01',
            pageNumber: 1,
            status: 'in_progress',
          }),
        ],
      }),
      listColoringPages: vi.fn().mockResolvedValue([
        makeColoringPage({
          id: 'independentpage',
          bookId: 'independent01',
          pageNumber: 1,
          createdAt: '2026-09-05T12:00:00.000Z',
          updatedAt: '2026-09-05T12:00:00.000Z',
        }),
      ]),
    });

    const result = await importArchiveBundle(
      {
        zip: new JSZip(),
        manifest,
        warnings: [],
        archiveFingerprint: 'a'.repeat(64),
      },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(true);
    expect(result.refMap).toMatchObject({
      'coloring-book:pending-book': 'archivebookid01',
      'coloring-page:pending-page': 'archivepage01',
    });
    expect(adapter.restoreArchiveColoringBook).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'coloring-book:pending-book' }),
      'a'.repeat(64),
      undefined,
      { allowCreate: false }
    );
    expect(adapter.restoreColoringPageMetadata).not.toHaveBeenCalled();
    expect(adapter.addColoringBookTags).toHaveBeenCalledWith('archivebookid01', []);
    expect(adapter.listColoringPages).not.toHaveBeenCalled();
    expect(recoveryStore.getBook('coloring-book:pending-book')).toBeUndefined();
  });

  it('prefers the deterministic archive book when a later independent book has the same key', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:known-book',
          oldId: 'known-book',
          title: 'Same Title',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: ['archive-tag'],
          pages: [archiveColoringPage(1)],
        },
      ],
    });
    const archivePage = makeColoringPage({ id: 'archive-page', bookId: 'archive-book' });
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi.fn().mockResolvedValue([
        { id: 'archive-book', title: 'Same Title' },
        { id: 'independent-book', title: 'Same Title' },
      ]),
      getArchiveColoringBookId: vi.fn().mockResolvedValue('archive-book'),
      restoreArchiveColoringBook: vi.fn().mockResolvedValue({
        bookId: 'archive-book',
        created: false,
        pages: [archivePage],
      }),
    });

    const result = await importArchiveBundle(
      {
        zip: new JSZip(),
        manifest,
        warnings: [],
        archiveFingerprint: 'd'.repeat(64),
      },
      adapter,
      createArchiveImportRecoveryStore('user-1', 'known-book-test')
    );

    expect(result.success).toBe(true);
    expect(adapter.restoreArchiveColoringBook).toHaveBeenCalledWith(
      expect.anything(),
      'd'.repeat(64),
      undefined,
      { allowCreate: false }
    );
    expect(adapter.addColoringBookTags).toHaveBeenCalledWith('archive-book', ['archive-tag']);
    expect(adapter.listColoringPages).not.toHaveBeenCalled();
    expect(adapter.createColoringBook).not.toHaveBeenCalled();
  });

  it('keeps a never-confirmed archive create retryable across reload and a later match', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:pending-create',
          oldId: 'pending-create',
          title: 'Same Title',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [archiveColoringPage(1)],
        },
      ],
    });
    const values = new Map<string, string>([
      [
        'og:archive-import-recovery:v2:user-1:pending-create-fingerprint:book:coloring-book%3Apending-create',
        JSON.stringify({ bookId: '' }),
      ],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    } as unknown as Storage;
    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'pending-create-fingerprint',
      storage
    );
    const restoredPage = makeColoringPage({
      id: 'archive-page',
      bookId: 'archive-book',
      status: 'not_started',
    });
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi
        .fn()
        .mockResolvedValue([{ id: 'independent-book', title: 'Same Title' }]),
      getArchiveColoringBookId: vi.fn().mockResolvedValue('archive-book'),
      restoreArchiveColoringBook: vi.fn().mockResolvedValue({
        bookId: 'archive-book',
        created: true,
        pages: [restoredPage],
      }),
    });

    const result = await importArchiveBundle(
      {
        zip: new JSZip(),
        manifest,
        warnings: [],
        archiveFingerprint: 'a'.repeat(64),
      },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(true);
    expect(adapter.restoreArchiveColoringBook).toHaveBeenCalledWith(
      expect.anything(),
      'a'.repeat(64),
      undefined,
      { allowCreate: true }
    );
    expect(adapter.addColoringBookTags).toHaveBeenCalledWith('archive-book', []);
  });

  it('does not recreate or merge when a confirmed recovery target is missing', async () => {
    const manifest = validManifest({
      coloringBooks: [
        {
          ref: 'coloring-book:missing-target',
          oldId: 'missing-target',
          title: 'Same Title',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: ['archive-tag'],
          pages: [archiveColoringPage(1)],
        },
      ],
    });
    const recoveryStore = createArchiveImportRecoveryStore('user-1', 'missing-target-test');
    recoveryStore.saveBook('coloring-book:missing-target', {
      bookId: 'missingarchive01',
      pages: {},
    });
    const adapter = makeImportAdapter({
      listExistingColoringBooks: vi
        .fn()
        .mockResolvedValue([{ id: 'independent01', title: 'Same Title' }]),
      getArchiveColoringBookId: vi.fn().mockResolvedValue('missingarchive01'),
      restoreArchiveColoringBook: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Archive recovery target no longer exists.'), { status: 409 })
        ),
    });

    const result = await importArchiveBundle(
      {
        zip: new JSZip(),
        manifest,
        warnings: [],
        archiveFingerprint: 'b'.repeat(64),
      },
      adapter,
      recoveryStore
    );

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Archive recovery target no longer exists.');
    expect(adapter.restoreArchiveColoringBook).toHaveBeenCalledWith(
      expect.anything(),
      'b'.repeat(64),
      undefined,
      { allowCreate: false }
    );
    expect(adapter.createColoringBook).not.toHaveBeenCalled();
    expect(adapter.addColoringBookTags).not.toHaveBeenCalled();
    expect(adapter.listColoringPages).not.toHaveBeenCalled();
    expect(recoveryStore.getBook('coloring-book:missing-target')).toMatchObject({
      bookId: 'missingarchive01',
    });
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

  it('does not query progress notes when the archive contains none', async () => {
    const page = makeColoringPage({ id: 'page', bookId: 'book' });
    const adapter = makeImportAdapter({
      createDiamondProject: vi.fn().mockResolvedValue({ id: 'project', title: 'Project' }),
      createColoringBook: vi.fn().mockResolvedValue({ id: 'book', title: 'Book' }),
      listColoringPages: vi.fn().mockResolvedValue([page]),
    });
    const manifest = validManifest({
      diamondProjects: [
        {
          ref: 'diamond-project:project',
          oldId: 'project',
          title: 'Project',
          status: 'not_started',
          kitCategory: 'full',
          tags: [],
          progressNotes: [],
        },
      ],
      coloringBooks: [
        {
          ref: 'coloring-book:book',
          oldId: 'book',
          title: 'Book',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [archiveColoringPage(1)],
        },
      ],
    });

    const result = await importArchiveBundle({ zip: new JSZip(), manifest, warnings: [] }, adapter);

    expect(result.success).toBe(true);
    expect(adapter.listDiamondProgressNotes).not.toHaveBeenCalled();
    expect(adapter.listColoringPageProgressNotes).not.toHaveBeenCalled();
  });

  it('persists large recovery checkpoints with bounded per-page writes', () => {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    } as unknown as Storage;
    const checkpoint: ColoringBookRecoveryCheckpoint = {
      bookId: 'book-id',
      pages: Object.fromEntries(
        Array.from({ length: 501 }, (_, index) => [
          `coloring-page:large-${index + 1}`,
          {
            pageId: `page-${index + 1}`,
            baseline: {
              ...snapshotForTest(),
              updatedAt: '2026-09-05T12:00:00.000Z',
            },
            intended: {
              ...snapshotForTest(),
              status: index === 500 ? ('completed' as const) : ('not_started' as const),
            },
          },
        ])
      ),
    };
    const store = createArchiveImportRecoveryStore('user-1', 'linear-storage-test', storage);

    store.saveBook('coloring-book:large', checkpoint);
    for (let pageNumber = 1; pageNumber <= 250; pageNumber += 1) {
      store.completePage(
        'coloring-book:large',
        `coloring-page:large-${pageNumber}` as ArchiveColoringPage['ref']
      );
    }

    expect(storage.setItem).toHaveBeenCalledTimes(502);
    expect(
      Math.max(...storage.setItem.mock.calls.map(([, value]) => (value as string).length))
    ).toBeLessThan(1_000);
    const reloaded = createArchiveImportRecoveryStore('user-1', 'linear-storage-test', storage);
    expect(reloaded.getBook('coloring-book:large')).toMatchObject({
      bookId: 'book-id',
      pages: {
        'coloring-page:large-501': expect.objectContaining({ pageId: 'page-501' }),
      },
    });
    expect(reloaded.getBook('coloring-book:large')?.pages['coloring-page:large-1']).toBeUndefined();
    const exposedSnapshot = reloaded.getBook('coloring-book:large');
    delete exposedSnapshot?.pages['coloring-page:large-501'];
    expect(reloaded.getBook('coloring-book:large')?.pages['coloring-page:large-501']).toBeDefined();
    reloaded.completeBook('coloring-book:large');
    expect(
      createArchiveImportRecoveryStore('user-1', 'linear-storage-test', storage).getBook(
        'coloring-book:large'
      )
    ).toBeUndefined();
  });

  it('loads legacy whole-archive recovery checkpoints', () => {
    const legacyKey = 'og:archive-import-recovery:v1:user-1:legacy-checkpoint-test';
    const values = new Map<string, string>([
      [
        legacyKey,
        JSON.stringify({
          books: {
            'coloring-book:legacy': {
              bookId: 'legacy-book-id',
              pages: {
                'coloring-page:legacy': {
                  pageId: 'legacy-page-id',
                  baseline: {
                    ...snapshotForTest(),
                    updatedAt: '2026-09-05T12:00:00.000Z',
                  },
                  intended: { ...snapshotForTest(), status: 'completed' },
                },
              },
            },
          },
        }),
      ],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    } as unknown as Storage;

    const store = createArchiveImportRecoveryStore('user-1', 'legacy-checkpoint-test', storage);

    expect(store.getBook('coloring-book:legacy')).toMatchObject({
      bookId: 'legacy-book-id',
      pages: {
        'coloring-page:legacy': expect.objectContaining({ pageId: 'legacy-page-id' }),
      },
    });
  });

  it('migrates every legacy book before removing the shared legacy checkpoint', () => {
    const legacyKey = 'og:archive-import-recovery:v1:user-1:multi-book-migration-test';
    const makeCheckpoint = (bookId: string, pageId: string) => ({
      bookId,
      pages: {
        [`coloring-page:${pageId}`]: {
          pageId,
          baseline: { ...snapshotForTest(), updatedAt: '2026-09-05T12:00:00.000Z' },
          intended: snapshotForTest(),
        },
      },
    });
    const values = new Map<string, string>([
      [
        legacyKey,
        JSON.stringify({
          books: {
            'coloring-book:first': makeCheckpoint('first-book', 'first-page'),
            'coloring-book:second': makeCheckpoint('second-book', 'second-page'),
          },
        }),
      ],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    } as unknown as Storage;

    createArchiveImportRecoveryStore('user-1', 'multi-book-migration-test', storage);

    expect(values.has(legacyKey)).toBe(false);
    expect(
      [...values.keys()].filter(key => key.includes(':multi-book-migration-test:book:'))
    ).toHaveLength(2);
    expect([...values.keys()].some(key => key.endsWith('coloring-book%3Asecond'))).toBe(true);
  });

  it('does not resurrect a completed book after another legacy book fails migration', async () => {
    const legacyKey = 'og:archive-import-recovery:v1:user-1:failed-migration-test';
    const makeCheckpoint = (bookId: string, pageId: string) => ({
      bookId,
      pages: {
        [`coloring-page:${pageId}`]: {
          pageId,
          baseline: { ...snapshotForTest(), updatedAt: '2026-09-05T12:00:00.000Z' },
          intended: snapshotForTest(),
        },
      },
    });
    const values = new Map<string, string>([
      [
        legacyKey,
        JSON.stringify({
          books: {
            'coloring-book:first': makeCheckpoint('first-book', 'first-page'),
            'coloring-book:second': makeCheckpoint('second-book', 'second-page'),
          },
        }),
      ],
    ]);
    let writeCount = 0;
    const storage = {
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        writeCount += 1;
        if (writeCount === 3) throw new Error('quota exceeded');
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    } as unknown as Storage;

    const store = createArchiveImportRecoveryStore('user-1', 'failed-migration-test', storage);

    expect(store.getBook('coloring-book:first')).toBeDefined();
    expect(store.getBook('coloring-book:second')).toBeDefined();
    expect(values.has(legacyKey)).toBe(true);
    store.completeBook('coloring-book:first');
    expect([...values.keys()].some(key => key.endsWith(':completed:coloring-book%3Afirst'))).toBe(
      true
    );

    vi.resetModules();
    const { createArchiveImportRecoveryStore: createReloadedStore } =
      await import('@/features/import-export/archive/archiveImportRecovery');
    const reloaded = createReloadedStore('user-1', 'failed-migration-test', storage);

    expect(reloaded.getBook('coloring-book:first')).toBeUndefined();
    expect(reloaded.getBook('coloring-book:second')).toMatchObject({
      bookId: 'second-book',
      pages: { 'coloring-page:second-page': expect.anything() },
    });
  });

  it('discards malformed persisted archive recovery checkpoints', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          books: {
            'coloring-book:broken': {
              bookId: 'book-id',
              pages: {
                'coloring-page:broken': {
                  pageId: 'page-id',
                  baseline: { mediumIds: [] },
                  intended: { mediumIds: [] },
                },
              },
            },
          },
        })
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;

    const recoveryStore = createArchiveImportRecoveryStore(
      'user-1',
      'malformed-storage-test',
      storage
    );

    expect(recoveryStore.getBook('coloring-book:broken')).toBeUndefined();
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

describe('color reference restore failure isolation', () => {
  it('rejects a swatch that expands beyond the archive entry limit', async () => {
    const page = {
      ...archiveColoringPage(1),
      colorReference: {
        ref: 'coloring-color-reference:1' as const,
        notes: '001',
        photoPaths: ['swatch.png'],
      },
    };
    const manifest = validManifest({
      schemaVersion: 2,
      coloringBooks: [
        {
          ref: 'coloring-book:swatches',
          oldId: 'swatches',
          title: 'Swatch recovery',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [page],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('swatch.png', new Uint8Array([1]));
    const entry = zip.file('swatch.png');
    if (!entry) throw new Error('Test ZIP is missing the swatch');
    vi.spyOn(entry, 'async').mockResolvedValue(new Blob([new Uint8Array([1])]) as never);
    const oversizedChunk = new Uint8Array([1]);
    Object.defineProperty(oversizedChunk, 'byteLength', { value: 64 * 1024 * 1024 + 1 });
    let onData: ((chunk: Uint8Array) => void) | undefined;
    vi.spyOn(entry, 'internalStream').mockReturnValue({
      on(event: string, callback: (chunk: Uint8Array) => void) {
        if (event === 'data') onData = callback;
      },
      pause() {},
      resume() {
        onData?.(oversizedChunk);
      },
    } as unknown as ReturnType<typeof entry.internalStream>);
    const restore = vi.fn(
      async (
        _pageId: string,
        _notes: string,
        paths: string[],
        loadPhoto: (path: string) => Promise<File>
      ) => {
        for (const path of paths) await loadPhoto(path);
        return { referenceId: 'reference-1', addedPhotoCount: paths.length };
      }
    );
    const adapter = makeImportAdapter({
      getArchiveColoringBookId: vi.fn().mockResolvedValue('book-1'),
      restoreArchiveColoringBook: vi.fn().mockResolvedValue({
        bookId: 'book-1',
        created: true,
        pages: [makeColoringPage({ id: 'page-1', pageNumber: 1 })],
      }),
      restoreColorReference: restore,
    });

    const result = await importArchiveBundle(
      { zip, manifest, warnings: [], archiveFingerprint: 'oversized-swatch' },
      adapter
    );

    expect(result.errors).toEqual([
      expect.stringMatching(/Archive entry swatch\.png is too large/),
    ]);
  });

  it.each(['missing file', 'conflict'])(
    'continues restoring progress and later pages after a swatch %s',
    async failure => {
      const pages: ArchiveColoringPage[] = [1, 2].map(number => ({
        ...archiveColoringPage(number),
        photoPaths: [`page-${number}.png`],
        colorReference: {
          ref: `coloring-color-reference:${number}`,
          notes: '001',
          photoPaths: [`swatch-${number}.png`],
        },
        progressNotes: [
          {
            ref: `coloring-page-note:${number}`,
            oldId: String(number),
            content: `Progress ${number}`,
            date: '2026-09-01',
            imagePath: `progress-${number}.png`,
          },
        ],
      }));
      const manifest = validManifest({
        schemaVersion: 2,
        coloringBooks: [
          {
            ref: 'coloring-book:swatches',
            oldId: 'swatches',
            title: 'Swatch recovery',
            isMystery: false,
            status: 'in_stash',
            totalPages: 2,
            tags: [],
            pages,
          },
        ],
      });
      const zip = new JSZip();
      for (const number of [1, 2]) {
        zip.file(`page-${number}.png`, 'page');
        zip.file(`progress-${number}.png`, 'progress');
        if (number !== 1 || failure !== 'missing file') zip.file(`swatch-${number}.png`, 'swatch');
      }
      const restore = vi
        .fn()
        .mockImplementation(
          async (
            pageId: string,
            _notes: string,
            photoPaths: string[],
            loadPhoto: (path: string) => Promise<File>
          ) => {
            if (failure === 'conflict' && pageId === 'page-1')
              throw Object.assign(new Error('Reference conflict'), { status: 409 });
            for (const path of photoPaths) await loadPhoto(path);
            return { referenceId: `reference-${pageId}`, addedPhotoCount: photoPaths.length };
          }
        );
      const recovery = createArchiveImportRecoveryStore('user-1', `swatch-isolation-${failure}`);
      const complete = vi.spyOn(recovery, 'completeBook');
      const adapter = makeImportAdapter({
        getArchiveColoringBookId: vi.fn().mockResolvedValue('book-1'),
        restoreArchiveColoringBook: vi.fn().mockResolvedValue({
          bookId: 'book-1',
          created: true,
          pages: [1, 2].map(pageNumber =>
            makeColoringPage({ id: `page-${pageNumber}`, pageNumber })
          ),
        }),
        restoreColorReference: restore,
      });
      const result = await importArchiveBundle(
        { zip, manifest, warnings: [], archiveFingerprint: 'isolation' },
        adapter,
        recovery
      );
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Page 1 in Swatch recovery:');
      expect(result.errors[0]).toContain(
        failure === 'conflict' ? 'Reference conflict' : 'Swatch photo is missing'
      );
      expect(restore).toHaveBeenCalledWith(
        'page-2',
        '001',
        expect.any(Array),
        expect.any(Function),
        'isolation:coloring-page:old-page-2'
      );
      expect(adapter.appendColoringPagePhotos).toHaveBeenCalledTimes(2);
      expect(adapter.createColoringPageProgressNote).toHaveBeenCalledTimes(2);
      expect(adapter.createColoringPageProgressNote).toHaveBeenCalledWith(
        'page-2',
        expect.objectContaining({ content: 'Progress 2' }),
        expect.any(File)
      );
      expect(adapter.reconcileColoringBookMetrics).toHaveBeenCalledWith('book-1');
      expect(complete).not.toHaveBeenCalled();
      expect(recovery.getBook('coloring-book:swatches')?.bookId).toBe('book-1');
    }
  );
});

describe('archive export size contract', () => {
  const emptyData: ArchiveExportSourceData = {
    projects: [],
    projectProgressNotes: [],
    coloringMediums: [],
    coloringPageProgressNotes: [],
    coloringBooks: [],
    coloringPagesByBookId: {},
  };

  it('accepts the final ZIP when it exactly matches the supplied size cap', async () => {
    const options = { exportedAt: '2026-05-20T00:00:00.000Z' };
    const baseline = await createArchiveZipFromData(emptyData, options);

    const result = await createArchiveZipFromData(emptyData, {
      ...options,
      maxArchiveBytes: baseline.blob.size,
    });

    expect(result.blob.size).toBe(baseline.blob.size);
  });

  it('rejects the final ZIP when it is one byte above the supplied size cap', async () => {
    const options = { exportedAt: '2026-05-20T00:00:00.000Z' };
    const baseline = await createArchiveZipFromData(emptyData, options);

    await expect(
      createArchiveZipFromData(emptyData, {
        ...options,
        maxArchiveBytes: baseline.blob.size - 1,
      })
    ).rejects.toThrow(/exceeds the maximum archive size/i);
  });

  it('embeds fetch warnings in the manifest and preserves the missing photo reference', async () => {
    const data: ArchiveExportSourceData = {
      projects: [
        {
          id: 'project-1',
          userId: 'user-1',
          title: 'Missing cover fixture',
          status: 'purchased',
          imageUrl: 'cover.png',
          createdAt: '',
          updatedAt: '',
        },
      ],
      projectProgressNotes: [],
      coloringMediums: [],
      coloringPageProgressNotes: [],
      coloringBooks: [],
      coloringPagesByBookId: {},
    };

    const { blob, manifest, warnings } = await createArchiveZipFromData(data, {
      fileToken: 'test-token',
      fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
    });

    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'photo-fetch-failed',
        path: 'photos/projects/project-1/cover.png',
        recordRef: 'project:project-1',
      }),
    ]);
    expect(manifest.warnings).toEqual(warnings);
    expect(manifest.files).toEqual([
      expect.objectContaining({ path: 'photos/projects/project-1/cover.png' }),
    ]);
    expect(manifest.diamondProjects[0].coverPhotoPath).toBe('photos/projects/project-1/cover.png');
    const zip = await JSZip.loadAsync(blob);
    const serializedManifest = JSON.parse(
      (await zip.file('manifest.json')?.async('string')) ?? '{}'
    ) as OrganizedGlitterArchiveManifestV1;
    expect(serializedManifest.warnings).toEqual(warnings);
    expect(zip.file('photos/projects/project-1/cover.png')).toBeNull();
  });
});

describe('color reference partial restore accounting', () => {
  it('keeps committed swatch additions when a later photo restore fails', async () => {
    const page = {
      ...archiveColoringPage(1),
      colorReference: {
        ref: 'coloring-color-reference:1' as const,
        notes: '001',
        photoPaths: ['swatch-1.png', 'swatch-2.png'],
      },
    };
    const manifest = validManifest({
      schemaVersion: 2,
      coloringBooks: [
        {
          ref: 'coloring-book:swatches',
          oldId: 'swatches',
          title: 'Swatch recovery',
          isMystery: false,
          status: 'in_stash',
          totalPages: 1,
          tags: [],
          pages: [page],
        },
      ],
    });
    const zip = new JSZip();
    zip.file('swatch-1.png', 'one');
    zip.file('swatch-2.png', 'two');
    const restore = vi.fn().mockRejectedValue(
      new PartialColorReferenceRestoreError('later photo failed', {
        addedPhotoCount: 1,
        referenceId: 'reference-1',
      })
    );
    const adapter = makeImportAdapter({
      getArchiveColoringBookId: vi.fn().mockResolvedValue('book-1'),
      restoreArchiveColoringBook: vi.fn().mockResolvedValue({
        bookId: 'book-1',
        created: true,
        pages: [makeColoringPage({ id: 'page-1', pageNumber: 1 })],
      }),
      restoreColorReference: restore,
    });

    const result = await importArchiveBundle(
      { zip, manifest, warnings: [], archiveFingerprint: 'partial-count' },
      adapter
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('later photo failed');
    expect(result.importedPhotoCount).toBe(1);
    expect(result.refMap['coloring-color-reference:1']).toBe('reference-1');
  });
});

describe('restoreArchivedColorReference', () => {
  it('preserves committed photo additions when a later transaction throws', async () => {
    serviceMocks.colorReferencesService.restore
      .mockResolvedValueOnce({ referenceId: 'reference-1', addedPhotoCount: 1 })
      .mockRejectedValueOnce(new Error('second sheet failed'));

    await expect(
      restoreArchivedColorReference(
        'page-1',
        'user-1',
        '001',
        ['one.png', 'two.png'],
        async path => new File([path], path),
        'archive:page-1'
      )
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'PartialColorReferenceRestoreError',
        addedPhotoCount: 1,
        referenceId: 'reference-1',
        message: 'second sheet failed',
      })
    );
    expect(serviceMocks.colorReferencesService.restore).toHaveBeenCalledTimes(2);
  });
});
