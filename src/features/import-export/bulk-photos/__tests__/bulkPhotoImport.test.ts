import { describe, expect, it, vi } from 'vitest';

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => file),
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: vi.fn(),
  captureException: mockCaptureException,
}));

import { analyzePhotoFiles } from '@/features/import-export/bulk-photos/analyzePhotoFiles';
import type { BulkPhotoImportAdapter } from '@/features/import-export/bulk-photos/bulkPhotoImport';
import { importBulkPhotos } from '@/features/import-export/bulk-photos/bulkPhotoImport';
import {
  parsePhotoImportCsv,
  parsePhotoImportJson,
} from '@/features/import-export/bulk-photos/photoImportManifest';
import type {
  BulkPhotoLibrary,
  BulkPhotoManifestEntry,
  BulkPhotoReviewRow,
} from '@/features/import-export/bulk-photos/types';

const imageFile = (name: string, lastModified = Date.parse('2024-05-10T12:00:00Z')) =>
  new File(['image'], name, { type: 'image/jpeg', lastModified });

const library: BulkPhotoLibrary = {
  diamondProjects: [
    {
      id: 'project-1',
      userId: 'user-1',
      title: 'Starry Fox',
      status: 'purchased',
      imageUrl: undefined,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'project-2',
      userId: 'user-1',
      title: 'Existing Cover',
      status: 'purchased',
      imageUrl: 'cover.jpg',
      createdAt: '',
      updatedAt: '',
    },
  ],
  coloringBooks: [
    {
      id: 'book-1',
      userId: 'user-1',
      title: 'Forest Animals',
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
  coloringPages: [
    {
      id: 'page-1',
      bookId: 'book-1',
      bookTitle: 'Forest Animals',
      pageNumber: 12,
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
};

function adapter(overrides: Partial<BulkPhotoImportAdapter> = {}): BulkPhotoImportAdapter {
  return {
    updateProjectCover: vi.fn().mockResolvedValue(undefined),
    createProjectProgressNote: vi.fn().mockResolvedValue(undefined),
    updateColoringBookCover: vi.fn().mockResolvedValue(undefined),
    appendColoringPagePhoto: vi.fn().mockResolvedValue({
      ...library.coloringPages[0],
      photos: ['new.jpg'],
    }),
    createColoringPageProgressNote: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('bulk photo import', () => {
  it('returns only supported fields from a valid JSON array', () => {
    expect(
      parsePhotoImportJson(
        JSON.stringify([
          {
            path: 'photo.jpg',
            targetRef: 'project:project-1',
            title: 'Starry Fox',
            date: '2024-05-10',
            note: 'Progress photo',
            unexpected: { ignored: true },
          },
        ])
      )
    ).toEqual([
      {
        path: 'photo.jpg',
        targetRef: 'project:project-1',
        title: 'Starry Fox',
        pageNumber: undefined,
        date: '2024-05-10',
        note: 'Progress photo',
      },
    ]);
  });

  it('validates JSON manifest paths, target refs, and page numbers', () => {
    expect(() =>
      parsePhotoImportJson(JSON.stringify({ files: [{ targetRef: 'project:project-1' }] }))
    ).toThrow(/file path/i);

    expect(() =>
      parsePhotoImportJson(
        JSON.stringify({ files: [{ path: 'photos/page.jpg', targetRef: 'book:book-1' }] })
      )
    ).toThrow(/targetRef/i);

    expect(
      parsePhotoImportJson(JSON.stringify({ files: [{ path: 'photos/page.jpg', pageNumber: 0 }] }))
    ).toEqual([{ path: 'photos/page.jpg', pageNumber: undefined }]);

    expect(
      parsePhotoImportJson(
        JSON.stringify({
          files: [
            {
              path: 'photos/page.jpg',
              targetRef: 'coloring-page:page-1',
              pageNumber: 12,
            },
          ],
        })
      )
    ).toEqual([
      {
        path: 'photos/page.jpg',
        targetRef: 'coloring-page:page-1',
        pageNumber: 12,
      },
    ]);
  });

  it('validates CSV manifest paths, target refs, target types, and page numbers', () => {
    expect(() => parsePhotoImportCsv('targetRef\nproject:project-1\n')).toThrow(/file path/i);

    expect(() => parsePhotoImportCsv('path,targetRef\nphotos/page.jpg,book:book-1\n')).toThrow(
      /targetRef/i
    );

    expect(() => parsePhotoImportCsv('path,targetType\nphotos/page.jpg,not-a-target\n')).toThrow(
      /targetType/i
    );

    expect(parsePhotoImportCsv('path,pageNumber\nphotos/page.jpg,abc\n')).toEqual([
      { path: 'photos/page.jpg', pageNumber: undefined },
    ]);

    expect(parsePhotoImportCsv('path,pageNumber\nphotos/page.jpg,0\n')).toEqual([
      { path: 'photos/page.jpg', pageNumber: undefined },
    ]);
  });

  it('parses valid CSV manifests with normalized optional fields', () => {
    expect(
      parsePhotoImportCsv(
        [
          'filename,targetType,id,title,pageNumber,date,note',
          ' photos/page.jpg , coloring-page-photo , coloring-page:page-1 , Forest Animals , 12 , 2024-05-10 , Progress photo ',
        ].join('\n')
      )
    ).toEqual([
      {
        path: 'photos/page.jpg',
        targetType: 'coloring-page-photo',
        targetRef: 'coloring-page:page-1',
        title: 'Forest Animals',
        pageNumber: 12,
        date: '2024-05-10',
        note: 'Progress photo',
      },
    ]);
  });

  it('does not fall back from an invalid explicit reference to a title or filename match', () => {
    const [row] = analyzePhotoFiles(
      [{ file: imageFile('cover.jpg'), path: 'Starry Fox/cover.jpg' }],
      library,
      [{ path: 'Starry Fox/cover.jpg', targetRef: 'coloring-book:missing', title: 'Starry Fox' }]
    );

    expect(row).toMatchObject({ confidence: 'unmatched', confirmed: false, excluded: true });
    expect(row.targetId).toBeUndefined();
    expect(row.reason).toMatch(/reference was not found/i);
  });

  it('falls back to a unique basename but skips ambiguous basenames', () => {
    const manifests: BulkPhotoManifestEntry[] = [
      {
        path: 'cover.jpg',
        targetType: 'project-cover',
        targetRef: 'project:project-1',
        date: '2024-05-01',
      },
    ];

    const [uniqueRow] = analyzePhotoFiles(
      [{ file: imageFile('cover.jpg'), path: 'Starry Fox/cover.jpg' }],
      library,
      manifests
    );

    expect(uniqueRow).toMatchObject({
      targetId: 'project-1',
      confidence: 'manifest',
      date: '2024-05-01',
    });

    const ambiguousRows = analyzePhotoFiles(
      [
        { file: imageFile('cover.jpg'), path: 'Starry Fox/cover.jpg' },
        { file: imageFile('cover.jpg'), path: 'Forest Animals/cover.jpg' },
      ],
      library,
      manifests
    );

    expect(ambiguousRows[0].confidence).not.toBe('manifest');
    expect(ambiguousRows[1].confidence).not.toBe('manifest');
  });

  it('does not overwrite an existing cover when a selected row lacks a skip reason', async () => {
    const row = analyzePhotoFiles(
      [{ file: imageFile('cover.jpg'), path: 'Existing Cover/cover.jpg' }],
      library
    )[0];
    const testAdapter = adapter();

    const result = await importBulkPhotos(
      [{ ...row, confirmed: true, excluded: false, skipReason: undefined }],
      library,
      { adapter: testAdapter }
    );

    expect(result).toMatchObject({ importedCount: 0, skippedCount: 1 });
    expect(testAdapter.updateProjectCover).not.toHaveBeenCalled();
  });

  it('rejects a confirmed row whose ID belongs only to another collection', async () => {
    const row: BulkPhotoReviewRow = {
      id: 'wrong-kind',
      file: imageFile('photo.jpg'),
      path: 'photo.jpg',
      targetType: 'coloring-book-cover',
      targetId: 'project-1',
      confidence: 'manifest',
      reason: 'test',
      confirmed: true,
      excluded: false,
      overwrite: false,
    };
    const testAdapter = adapter();

    const result = await importBulkPhotos([row], library, { adapter: testAdapter });

    expect(result).toMatchObject({ importedCount: 0, failedCount: 1 });
    expect(result.errors[0].message).toMatch(/target type/i);
    expect(testAdapter.updateColoringBookCover).not.toHaveBeenCalled();
  });

  it('serializes coloring page photo appends for the same page', async () => {
    const rows: BulkPhotoReviewRow[] = [
      {
        id: 'row-1',
        file: imageFile('page-12-a.jpg'),
        path: 'Forest Animals/page-12-a.jpg',
        targetType: 'coloring-page-photo',
        targetId: 'page-1',
        targetLabel: 'Forest Animals, page 12',
        confidence: 'high',
        reason: 'test',
        confirmed: true,
        excluded: false,
        overwrite: false,
      },
      {
        id: 'row-2',
        file: imageFile('page-12-b.jpg'),
        path: 'Forest Animals/page-12-b.jpg',
        targetType: 'coloring-page-photo',
        targetId: 'page-1',
        targetLabel: 'Forest Animals, page 12',
        confidence: 'high',
        reason: 'test',
        confirmed: true,
        excluded: false,
        overwrite: false,
      },
    ];
    const appendColoringPagePhoto = vi
      .fn()
      .mockResolvedValueOnce({ ...library.coloringPages[0], photos: ['a.jpg'] })
      .mockResolvedValueOnce({ ...library.coloringPages[0], photos: ['a.jpg', 'b.jpg'] });

    const result = await importBulkPhotos(rows, library, {
      adapter: adapter({ appendColoringPagePhoto }),
      concurrency: 2,
    });

    expect(appendColoringPagePhoto).toHaveBeenNthCalledWith(1, 'page-1', expect.any(File), []);
    expect(appendColoringPagePhoto).toHaveBeenNthCalledWith(2, 'page-1', expect.any(File), [
      'a.jpg',
    ]);
    expect(result.importedCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });
});
