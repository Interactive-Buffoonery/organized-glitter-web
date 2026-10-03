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
import { importBulkPhotos } from '@/features/import-export/bulk-photos/bulkPhotoImport';
import {
  parsePhotoImportCsv,
  parsePhotoImportJson,
} from '@/features/import-export/bulk-photos/photoImportManifest';
import type { BulkPhotoImportAdapter } from '@/features/import-export/bulk-photos/bulkPhotoImport';
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
  it.each(['{', 'null', '42', '{}', '{"files":null}'])(
    'reports malformed JSON or container input: %s',
    content => {
      expect(() => parsePhotoImportJson(content)).toThrow(/photo-import\.json/);
    }
  );

  it.each([null, 42, []])('rejects a malformed JSON file entry: %s', entry => {
    expect(() =>
      parsePhotoImportJson(JSON.stringify({ files: [{ path: 'ok.jpg' }, entry] }))
    ).toThrow(/photo-import\.json file entry 2 must be an object/);
  });

  it.each([42, {}, []])('rejects a %s title before matching or import dispatch', title => {
    const match = vi.fn(analyzePhotoFiles);
    const dispatch = vi.fn(importBulkPhotos);

    expect(() => {
      const manifests = parsePhotoImportJson(JSON.stringify([{ path: 'photo.jpg', title }]));
      const rows = match([{ file: imageFile('photo.jpg') }], library, manifests);
      void dispatch(rows, library);
    }).toThrow(/photo-import\.json file entry 1 has an invalid title/);
    expect(match).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['date', 42],
    ['date', '2024-02-30'],
    ['date', '2024-5-10'],
    ['note', { text: 'Progress photo' }],
  ])('identifies an invalid %s in its JSON file entry', (field, value) => {
    expect(() =>
      parsePhotoImportJson(
        JSON.stringify({ files: [{ path: 'ok.jpg' }, { path: 'bad.jpg', [field]: value }] })
      )
    ).toThrow(new RegExp(`photo-import\\.json file entry 2 has an invalid ${field}`));
  });

  it('tries the next cover photo when the first upload fails', async () => {
    const rows: BulkPhotoReviewRow[] = ['first.jpg', 'second.jpg'].map((name, index) => ({
      id: `row-${index}`,
      file: imageFile(name),
      path: name,
      targetType: 'project-cover',
      targetId: 'project-1',
      confidence: 'manifest',
      reason: 'test',
      confirmed: true,
      excluded: false,
      overwrite: false,
    }));
    const updateProjectCover = vi
      .fn()
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce(undefined);

    const result = await importBulkPhotos(rows, library, {
      adapter: adapter({ updateProjectCover }),
      concurrency: 2,
    });

    expect(updateProjectCover).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ importedCount: 1, skippedCount: 0, failedCount: 1 });
  });

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

  it.each([
    ['extra cells', 'path,title\nphoto.jpg,"A","B"\n', 2],
    ['unterminated quote', 'path,title\nphoto.jpg,"Unfinished title\n', 2],
    ['unterminated quote after a valid row', 'path,title\na.jpg,ok\nb.jpg,"Unfinished\n', 3],
  ])('rejects CSV %s before exposing partial rows', (_case, content, row) => {
    expect(() => parsePhotoImportCsv(content)).toThrow(
      new RegExp(`photo-import\\.csv row ${row} is malformed:`)
    );
  });

  it('accepts CSV rows with omitted optional trailing columns', () => {
    expect(parsePhotoImportCsv('path,title,targetRef\nphoto.jpg,fox\n')).toEqual([
      { path: 'photo.jpg', title: 'fox', pageNumber: undefined },
    ]);
    expect(() => parsePhotoImportCsv('path,title,targetRef\n,fox\n')).toThrow(/file path/i);
  });

  it('rejects duplicate manifest paths after case and separator normalization', () => {
    expect(() =>
      parsePhotoImportJson(
        JSON.stringify([
          { path: ' Photos/Cover.jpg ', targetRef: 'project:project-1' },
          { path: 'photos\\cover.JPG', targetRef: 'project:project-2' },
        ])
      )
    ).toThrow(/photo-import\.json file entry 2 duplicates the path in entry 1/);
    expect(() =>
      parsePhotoImportCsv(
        'path,targetRef\nPhotos/Cover.jpg,project:project-1\nphotos\\cover.JPG,project:project-2\n'
      )
    ).toThrow(/photo-import\.csv file entry 2 duplicates the path in entry 1/);
  });

  it('rejects duplicate paths across separately parsed JSON and CSV manifests', () => {
    const json = parsePhotoImportJson(
      JSON.stringify([{ path: 'Photos/Cover.jpg', targetRef: 'project:project-1' }])
    );
    const csv = parsePhotoImportCsv('path,targetRef\nphotos\\cover.JPG,project:project-2\n');

    expect(() =>
      analyzePhotoFiles([{ file: imageFile('cover.jpg'), path: 'Photos/Cover.jpg' }], library, [
        ...json,
        ...csv,
      ])
    ).toThrow(/photo import manifest file entry 2 duplicates the path in entry 1/);
  });

  it('keeps valid rows when one row has a non-numeric page number', () => {
    const entries = parsePhotoImportCsv(
      [
        'path,targetRef,pageNumber',
        'photos/page-12.jpg,coloring-page:page-1,12',
        'photos/cover.jpg,project:project-1,cover',
        'photos/page-13.jpg,coloring-page:page-1,3a',
      ].join('\n')
    );

    expect(entries).toEqual([
      { path: 'photos/page-12.jpg', targetRef: 'coloring-page:page-1', pageNumber: 12 },
      { path: 'photos/cover.jpg', targetRef: 'project:project-1', pageNumber: undefined },
      { path: 'photos/page-13.jpg', targetRef: 'coloring-page:page-1', pageNumber: undefined },
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

  it('matches by manifest with highest confidence', () => {
    const manifests: BulkPhotoManifestEntry[] = [
      {
        path: 'photos/starry.jpg',
        targetType: 'project-progress-note',
        targetRef: 'project:project-1',
        date: '2024-05-01',
      },
    ];

    const [row] = analyzePhotoFiles(
      [{ file: imageFile('starry.jpg'), path: 'photos/starry.jpg' }],
      library,
      manifests
    );

    expect(row).toMatchObject({
      targetType: 'project-progress-note',
      targetId: 'project-1',
      confidence: 'manifest',
      confirmed: true,
    });
  });

  it.each([
    ['project', 'project-cover', 'Starry Fox'],
    ['coloring-book', 'coloring-book-cover', 'Forest Animals'],
    ['coloring-page', 'coloring-page-photo', 'Forest Animals, page 12'],
  ] as const)(
    'resolves %s references only in their own collection',
    (kind, targetType, targetLabel) => {
      const collisionLibrary: BulkPhotoLibrary = {
        diamondProjects: [{ ...library.diamondProjects[0], id: 'shared-id' }],
        coloringBooks: [{ ...library.coloringBooks[0], id: 'shared-id' }],
        coloringPages: [{ ...library.coloringPages[0], id: 'shared-id' }],
      };
      const [row] = analyzePhotoFiles(
        [{ file: imageFile('photo.jpg'), path: 'photo.jpg' }],
        collisionLibrary,
        [{ path: 'photo.jpg', targetRef: `${kind}:shared-id` }]
      );

      expect(row).toMatchObject({
        targetId: 'shared-id',
        targetType,
        targetLabel,
        confidence: 'manifest',
        confirmed: true,
      });
    }
  );

  it.each([
    ['project', 'project-cover'],
    ['project', 'project-progress-note'],
    ['coloring-book', 'coloring-book-cover'],
    ['coloring-page', 'coloring-page-photo'],
    ['coloring-page', 'coloring-page-progress-note'],
  ] as const)('accepts %s references with %s', (kind, targetType) => {
    const targetId =
      kind === 'project' ? 'project-1' : kind === 'coloring-book' ? 'book-1' : 'page-1';
    const [row] = analyzePhotoFiles(
      [{ file: imageFile('photo.jpg'), path: 'photo.jpg' }],
      library,
      [{ path: 'photo.jpg', targetRef: `${kind}:${targetId}`, targetType }]
    );

    expect(row).toMatchObject({ targetId, targetType, confidence: 'manifest', confirmed: true });
  });

  it.each([
    ['coloring-book:project-1', undefined],
    ['project:project-1', 'coloring-book-cover'],
    ['coloring-page:page-1', 'project-progress-note'],
  ] as const)(
    'does not confirm an inconsistent manifest target %s with type %s',
    (targetRef, targetType) => {
      const [row] = analyzePhotoFiles(
        [{ file: imageFile('photo.jpg'), path: 'photo.jpg' }],
        library,
        [{ path: 'photo.jpg', targetRef, targetType }]
      );

      expect(row).toMatchObject({ confidence: 'unmatched', confirmed: false, excluded: true });
      expect(row.targetId).toBeUndefined();
      expect(row.reason).toMatch(/manifest/i);
    }
  );

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

  it('accepts project title matches only with project target types', () => {
    const [valid, invalid] = analyzePhotoFiles(
      [
        { file: imageFile('valid.jpg'), path: 'valid.jpg' },
        { file: imageFile('invalid.jpg'), path: 'invalid.jpg' },
      ],
      library,
      [
        { path: 'valid.jpg', title: 'Starry Fox', targetType: 'project-progress-note' },
        { path: 'invalid.jpg', title: 'Starry Fox', targetType: 'coloring-page-photo' },
      ]
    );

    expect(valid).toMatchObject({
      targetType: 'project-progress-note',
      targetId: 'project-1',
      confirmed: true,
    });
    expect(invalid).toMatchObject({ confidence: 'unmatched', confirmed: false, excluded: true });
    expect(invalid.targetId).toBeUndefined();
  });

  it('does not route a same-named file in another folder to a full-path manifest entry', () => {
    const manifests: BulkPhotoManifestEntry[] = [
      {
        path: 'Starry Fox/cover.jpg',
        targetType: 'project-cover',
        targetRef: 'project:project-1',
        date: '2024-05-01',
      },
    ];

    const rows = analyzePhotoFiles(
      [
        { file: imageFile('cover.jpg'), path: 'Starry Fox/cover.jpg' },
        { file: imageFile('cover.jpg'), path: 'Forest Animals/cover.jpg' },
      ],
      library,
      manifests
    );

    expect(rows[0]).toMatchObject({
      targetId: 'project-1',
      targetType: 'project-cover',
      confidence: 'manifest',
      date: '2024-05-01',
    });
    expect(rows[1].confidence).not.toBe('manifest');
    expect(rows[1].date).toBeUndefined();
  });

  it('does not route a lone same-named file to a full-path manifest entry', () => {
    const manifests: BulkPhotoManifestEntry[] = [
      {
        path: 'Starry Fox/cover.jpg',
        targetType: 'project-cover',
        targetRef: 'project:project-1',
        date: '2024-05-01',
      },
    ];

    const [row] = analyzePhotoFiles(
      [{ file: imageFile('cover.jpg'), path: 'Forest Animals/cover.jpg' }],
      library,
      manifests
    );

    expect(row.confidence).not.toBe('manifest');
    expect(row.date).toBeUndefined();
  });

  it('matches backslash photo paths against forward-slash manifest entries', () => {
    const manifests: BulkPhotoManifestEntry[] = [
      {
        path: 'Starry Fox/cover.jpg',
        targetType: 'project-cover',
        targetRef: 'project:project-1',
        date: '2024-05-01',
      },
    ];

    const [row] = analyzePhotoFiles(
      [{ file: imageFile('cover.jpg'), path: 'Starry Fox\\cover.jpg' }],
      library,
      manifests
    );

    expect(row).toMatchObject({
      targetId: 'project-1',
      targetType: 'project-cover',
      confidence: 'manifest',
      date: '2024-05-01',
    });
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

  it('matches exact title folders and coloring page numbers', () => {
    const rows = analyzePhotoFiles(
      [
        { file: imageFile('cover.jpg'), path: 'Starry Fox/cover.jpg' },
        { file: imageFile('page-12.jpg'), path: 'Forest Animals/page-12.jpg' },
      ],
      library
    );

    expect(rows[0]).toMatchObject({ targetId: 'project-1', confidence: 'high', confirmed: true });
    expect(rows[1]).toMatchObject({
      targetId: 'page-1',
      targetType: 'coloring-page-photo',
      confidence: 'high',
      confirmed: true,
    });
  });

  it('auto-confirms only high-confidence guesses and leaves medium and low for review', () => {
    const rows = analyzePhotoFiles(
      [
        { file: imageFile('page-12.jpg'), path: 'archive/page-12.jpg' },
        { file: imageFile('starry.jpg'), path: 'archive/starry.jpg' },
      ],
      library
    );

    expect(rows[0]).toMatchObject({
      targetId: 'page-1',
      confidence: 'medium',
      confirmed: false,
      excluded: false,
    });
    expect(rows[1]).toMatchObject({
      targetId: 'project-1',
      confidence: 'low',
      confirmed: false,
      excluded: false,
    });
  });

  it('matches IDs only when they appear as exact path segments or delimited tokens', () => {
    const rows = analyzePhotoFiles(
      [
        { file: imageFile('cover.jpg'), path: 'archive/project-1/cover.jpg' },
        { file: imageFile('token.jpg'), path: 'archive/cover_project-1_final.jpg' },
        { file: imageFile('truncated.jpg'), path: 'archive/project-12/other.jpg' },
        { file: imageFile('split.jpg'), path: 'archive/project/1/other.jpg' },
      ],
      library
    );

    expect(rows[0]).toMatchObject({
      targetId: 'project-1',
      confidence: 'high',
      reason: 'Filename or folder contains the project ID',
    });
    expect(rows[1]).toMatchObject({
      targetId: 'project-1',
      confidence: 'high',
      reason: 'Filename or folder contains the project ID',
    });
    expect(rows[2]).toMatchObject({
      confidence: 'unmatched',
      confirmed: false,
      excluded: true,
    });
    expect(rows[3]).toMatchObject({
      confidence: 'unmatched',
      confirmed: false,
      excluded: true,
    });
  });

  it('skips unmatched files and existing covers by default', () => {
    const rows = analyzePhotoFiles(
      [
        { file: imageFile('unknown.jpg'), path: 'unknown.jpg' },
        { file: imageFile('cover.jpg'), path: 'Existing Cover/cover.jpg' },
      ],
      library
    );

    expect(rows[0]).toMatchObject({ confidence: 'unmatched', confirmed: false, excluded: true });
    expect(rows[1]).toMatchObject({
      targetId: 'project-2',
      confirmed: false,
      excluded: true,
      overwrite: false,
      skipReasonCode: 'existing-cover',
    });
  });

  it('honors explicit cover overwrite', async () => {
    const row = analyzePhotoFiles(
      [{ file: imageFile('cover.jpg'), path: 'Existing Cover/cover.jpg' }],
      library
    )[0];
    const testAdapter = adapter();

    const result = await importBulkPhotos(
      [{ ...row, confirmed: true, excluded: false, overwrite: true, skipReason: undefined }],
      library,
      { adapter: testAdapter }
    );

    expect(testAdapter.updateProjectCover).toHaveBeenCalledWith('project-2', expect.any(File));
    expect(result.overwriteCount).toBe(1);
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

  it.each([
    ['project-cover', 'project-1', 'updateProjectCover'],
    ['coloring-book-cover', 'book-1', 'updateColoringBookCover'],
  ] as const)(
    'imports only the first selected %s for an empty target',
    async (targetType, targetId, method) => {
      const rows: BulkPhotoReviewRow[] = ['first.jpg', 'second.jpg'].map((name, index) => ({
        id: `row-${index}`,
        file: imageFile(name),
        path: name,
        targetType,
        targetId,
        confidence: 'manifest',
        reason: 'test',
        confirmed: true,
        excluded: false,
        overwrite: false,
      }));
      const testAdapter = adapter();

      const result = await importBulkPhotos(rows, library, {
        adapter: testAdapter,
        concurrency: 2,
      });

      expect(testAdapter[method]).toHaveBeenCalledTimes(1);
      expect(testAdapter[method]).toHaveBeenCalledWith(targetId, rows[0].file);
      expect(result).toMatchObject({ importedCount: 1, skippedCount: 1, failedCount: 0 });
    }
  );

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

  it('enforces the coloring page photo limit', async () => {
    const fullLibrary: BulkPhotoLibrary = {
      ...library,
      coloringPages: [
        { ...library.coloringPages[0], photos: Array.from({ length: 99 }, (_, i) => `${i}.jpg`) },
      ],
    };
    const row: BulkPhotoReviewRow = {
      id: 'row-1',
      file: imageFile('page-12.jpg'),
      path: 'Forest Animals/page-12.jpg',
      targetType: 'coloring-page-photo',
      targetId: 'page-1',
      targetLabel: 'Forest Animals, page 12',
      confidence: 'high',
      reason: 'test',
      confirmed: true,
      excluded: false,
      overwrite: false,
    };

    const result = await importBulkPhotos([row], fullLibrary, { adapter: adapter() });

    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0].message).toMatch(/99 photos/i);
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

  it('processes every non-grouped row exactly once under concurrency', async () => {
    const rows: BulkPhotoReviewRow[] = Array.from({ length: 7 }, (_, i) => ({
      id: `row-${i}`,
      file: imageFile(`progress-${i}.jpg`),
      path: `Starry Fox/progress-${i}.jpg`,
      targetType: 'project-progress-note',
      targetId: 'project-1',
      targetLabel: 'Starry Fox',
      confidence: 'high',
      reason: 'test',
      confirmed: true,
      excluded: false,
      overwrite: false,
    }));
    const createProjectProgressNote = vi.fn().mockResolvedValue(undefined);

    const result = await importBulkPhotos(rows, library, {
      adapter: adapter({ createProjectProgressNote }),
      concurrency: 2,
    });

    expect(createProjectProgressNote).toHaveBeenCalledTimes(7);
    expect(result.importedCount).toBe(7);
    expect(result.failedCount).toBe(0);
  });

  it('creates progress notes with the default note body and reports partial failures', async () => {
    const rows: BulkPhotoReviewRow[] = [
      {
        id: 'row-1',
        file: imageFile('progress.jpg'),
        path: 'Starry Fox/progress.jpg',
        targetType: 'project-progress-note',
        targetId: 'project-1',
        targetLabel: 'Starry Fox',
        confidence: 'high',
        reason: 'test',
        confirmed: true,
        excluded: false,
        overwrite: false,
      },
      {
        id: 'row-2',
        file: imageFile('bad.jpg'),
        path: 'Starry Fox/bad.jpg',
        targetType: 'project-cover',
        targetId: 'project-1',
        targetLabel: 'Starry Fox',
        confidence: 'high',
        reason: 'test',
        confirmed: true,
        excluded: false,
        overwrite: false,
      },
    ];
    const testAdapter = adapter({
      updateProjectCover: vi.fn().mockRejectedValue(new Error('upload failed')),
    });

    const result = await importBulkPhotos(rows, library, { adapter: testAdapter });

    expect(testAdapter.createProjectProgressNote).toHaveBeenCalledWith(
      'project-1',
      expect.any(File),
      '2024-05-10',
      'Imported photo'
    );
    expect(result.importedCount).toBe(1);
    expect(result.createdProgressNoteCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0].message).toBe('upload failed');
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        $exception_source: 'bulk_photo_import',
        operation: 'import_photo',
        status: 'partial',
        failed_count_bucket: '1',
        surface: 'settings_data',
      })
    );
  });
});
