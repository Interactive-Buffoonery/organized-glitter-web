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

  it('warns when a retried authorization failure still cannot fetch the file', async () => {
    const result = await fetchPocketBaseFile(
      {
        collectionName: 'coloring_page_color_references',
        recordId: 'ref-1',
        filename: 'swatch.png',
        entry,
        fileToken: 'expired-token',
        refreshFileToken: vi.fn().mockResolvedValue('fresh-token'),
      },
      vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    );

    expect(result.blob).toBeUndefined();
    expect(result.warning).toMatchObject({
      code: 'photo-fetch-failed',
      path: entry.path,
    });
  });

  it('renews an expired token when PocketBase hides denial as a 404', async () => {
    const refreshFileToken = vi.fn().mockResolvedValue('fresh-token');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
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
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.warning).toBeUndefined();
  });

  it('retries a protected-file 404 once, then reports a genuinely missing file', async () => {
    const refreshFileToken = vi.fn().mockResolvedValue('fresh-token');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

    const result = await fetchPocketBaseFile(
      {
        collectionName: 'coloring_page_color_references',
        recordId: 'ref-1',
        filename: 'missing.png',
        entry,
        fileToken: 'expired-token',
        refreshFileToken,
      },
      fetchImpl
    );

    expect(refreshFileToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.warning?.code).toBe('photo-fetch-failed');
  });
});
