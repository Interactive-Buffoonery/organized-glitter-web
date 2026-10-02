import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/import-export/archive/archiveImportLimits', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/features/import-export/archive/archiveImportLimits')
  >()),
  MAX_ARCHIVE_ENTRY_BYTES: 1_024,
}));

import {
  createArchiveZipFromData,
  type ArchiveExportSourceData,
} from '@/features/import-export/archive/exportArchive';

const emptyData: ArchiveExportSourceData = {
  projects: [],
  projectProgressNotes: [],
  coloringMediums: [],
  coloringPageProgressNotes: [],
  coloringBooks: [],
  coloringPagesByBookId: {},
};

describe('legacy archive export entry limits', () => {
  it('rejects generated CSV bytes that the importer would reject', async () => {
    const book: ArchiveExportSourceData['coloringBooks'][number] = {
      id: 'book-1',
      userId: 'user-1',
      title: 'é'.repeat(300),
      isMystery: false,
      status: 'in_stash',
      totalPages: 2,
      tags: [],
      createdAt: '',
      updatedAt: '',
    };
    const page = (
      pageNumber: number
    ): ArchiveExportSourceData['coloringPagesByBookId'][string][number] => ({
      id: `page-${pageNumber}`,
      bookId: book.id,
      pageNumber,
      status: 'not_started',
      photos: [],
      mediumIds: [],
      createdAt: '',
      updatedAt: '',
    });

    const addEntry = vi.spyOn(JSZip.prototype, 'file');
    const generate = vi.spyOn(JSZip.prototype, 'generateAsync');
    try {
      await expect(
        createArchiveZipFromData({
          ...emptyData,
          coloringBooks: [book],
          coloringPagesByBookId: { [book.id]: [page(1), page(2)] },
        })
      ).rejects.toThrow();
      const addedPaths = addEntry.mock.calls.map(([path]) => path);
      expect(addedPaths).toContain('coloring-books.csv');
      expect(addedPaths).not.toContain('coloring-pages.csv');
      expect(generate).not.toHaveBeenCalled();
    } finally {
      addEntry.mockRestore();
      generate.mockRestore();
    }
  });

  it('rejects a fetched photo above the entry cap before building the ZIP', async () => {
    const data: ArchiveExportSourceData = {
      ...emptyData,
      projects: [
        {
          id: 'project-1',
          userId: 'user-1',
          title: 'Project',
          status: 'purchased',
          imageUrl: 'cover.jpg',
          createdAt: '',
          updatedAt: '',
        },
      ],
    };
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(1_025), { status: 200 }));

    const addEntry = vi.spyOn(JSZip.prototype, 'file');
    const generate = vi.spyOn(JSZip.prototype, 'generateAsync');
    try {
      await expect(
        createArchiveZipFromData(data, { fileToken: 'test-token', fetchImpl })
      ).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledOnce();
      const addedPaths = addEntry.mock.calls.map(([path]) => path);
      expect(addedPaths).toContain('coloring-pages.csv');
      expect(addedPaths).not.toContain('photos/projects/project-1/cover.jpg');
      expect(generate).not.toHaveBeenCalled();
    } finally {
      addEntry.mockRestore();
      generate.mockRestore();
    }
  });
});
