import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbase', () => ({
  resolveFileUrl: (collectionName: string, recordId: string, filename: string) =>
    `https://pb.example/api/files/${collectionName}/${recordId}/${filename}`,
}));

import { fetchPocketBaseFile } from '@/features/import-export/archive/fileFetch';
import type { ArchiveFileEntry } from '@/features/import-export/archive/types';

const entry: ArchiveFileEntry = {
  path: 'photos/swatch.png',
  role: 'coloring-swatch-photo',
  recordRef: 'coloring-color-reference:ref-1',
  field: 'photos',
  originalFilename: 'swatch.png',
};

describe('fetchPocketBaseFile', () => {
  it('renews an expired file token and retries authorization failures', async () => {
    const refreshFileToken = vi.fn().mockResolvedValue('fresh-token');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response('sheet', { status: 200 }));

    const result = await fetchPocketBaseFile(
      {
        collectionName: 'coloring_page_color_references',
        recordId: 'ref-1',
        filename: 'swatch.png',
        entry,
        fileToken: 'expired-token',
        refreshFileToken,
      },
      fetchImpl
    );

    expect(refreshFileToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://pb.example/api/files/coloring_page_color_references/ref-1/swatch.png?token=expired-token'
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://pb.example/api/files/coloring_page_color_references/ref-1/swatch.png?token=fresh-token'
    );
    expect(result.warning).toBeUndefined();
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob?.size).toBeGreaterThan(0);
  });
});
