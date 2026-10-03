import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('@/lib/pocketbase', () => ({ pb: { send } }));

const { ArchiveRestoreV3Service } = await import('./archiveRestoreV3.service');
const backupId = '123e4567-e89b-42d3-a456-426614174000';

describe('ArchiveRestoreV3Service', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('accepts only the compatible multipart capability contract', async () => {
    send.mockResolvedValue({
      restoreSchemaVersions: [1, 2, 3],
      multipartRestore: true,
      maxPartBytes: 536870912,
      maxAssetBytesByRole: {
        'project-cover': 52428800,
        'project-progress-note': 52428800,
        'coloring-book-cover': 52428800,
        'coloring-page-photo': 52428800,
        'coloring-page-progress-note': 52428800,
        'coloring-swatch-photo': 52428800,
      },
      maxRestoreRequestChars: 500000,
      maxMetadataStringChars: 100000,
      maxMetadataListEntries: 1000,
      maxMetadataListEntryChars: 255,
      maxMetadataNumber: 1000000000,
      maxAssetPosition: 1000000,
      receiptVersion: 1,
    });

    await expect(ArchiveRestoreV3Service.getCapabilities()).resolves.toMatchObject({
      multipartRestore: true,
      maxPartBytes: 536870912,
      maxAssetBytesByRole: {
        'project-cover': 52428800,
        'project-progress-note': 52428800,
        'coloring-book-cover': 52428800,
        'coloring-page-photo': 52428800,
        'coloring-page-progress-note': 52428800,
        'coloring-swatch-photo': 52428800,
      },
      maxRestoreRequestChars: 500000,
      maxMetadataStringChars: 100000,
      maxMetadataListEntries: 1000,
      maxMetadataListEntryChars: 255,
      maxMetadataNumber: 1000000000,
      maxAssetPosition: 1000000,
    });
    expect(send).toHaveBeenCalledWith('/api/archive/capabilities', {
      method: 'GET',
      signal: undefined,
      requestKey: null,
    });
  });

  it('turns an incompatible capability response into the server-update message', async () => {
    send.mockResolvedValue({
      restoreSchemaVersions: [1, 2],
      multipartRestore: false,
      maxPartBytes: 1,
      maxAssetBytesByRole: {
        'project-cover': 52428800,
        'project-progress-note': 52428800,
        'coloring-book-cover': 52428800,
        'coloring-page-photo': 52428800,
        'coloring-page-progress-note': 52428800,
        'coloring-swatch-photo': 52428800,
      },
      maxRestoreRequestChars: 500000,
      maxMetadataStringChars: 100000,
      maxMetadataListEntries: 1000,
      maxMetadataListEntryChars: 255,
      maxMetadataNumber: 1000000000,
      maxAssetPosition: 1000000,
      receiptVersion: 0,
    });
    await expect(ArchiveRestoreV3Service.getCapabilities()).rejects.toMatchObject({
      reason: 'server_update_required',
    });
  });

  it('turns an old-server 404 into the server-update message', async () => {
    send.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));

    await expect(ArchiveRestoreV3Service.getCapabilities()).rejects.toMatchObject({
      reason: 'server_update_required',
    });
  });

  it('preserves a network failure', async () => {
    send.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(ArchiveRestoreV3Service.getCapabilities()).rejects.toThrow(/Failed to fetch/i);
  });

  it('sends the exact request field and declared asset field to the restore endpoint', async () => {
    send.mockResolvedValue({
      outcome: 'created',
      itemId: 'asset:photo',
      targetRecordId: 'target-1',
      assetOutcomes: [{ assetId: 'photo', outcome: 'created' }],
    });
    const item = {
      itemId: 'asset:photo',
      kind: 'asset' as const,
      digest: 'a'.repeat(64),
      parent: {
        itemId: 'coloring-page:p1',
        kind: 'coloring-page' as const,
        digest: 'b'.repeat(64),
        metadata: {
          pageNumber: 1,
          status: 'not_started' as const,
          mediumItemIds: [],
        },
      },
      metadata: { position: 0 },
      assets: [
        {
          assetId: 'photo',
          digest: 'c'.repeat(64),
          byteLength: 3,
          path: 'assets/photo/photo.jpg',
          role: 'coloring-page-photo' as const,
          field: 'photos',
          originalFilename: 'photo.jpg',
        },
      ],
    };
    await ArchiveRestoreV3Service.restoreItem({
      request: {
        backupId,
        partNumber: 1,
        partCount: 1,
        inventoryDigest: 'd'.repeat(64),
        item,
      },
      assets: new Map([['photo', new Blob([new Uint8Array([1, 2, 3])])]]),
    });

    const [path, options] = send.mock.calls[0];
    expect(path).toBe('/api/archive/v3/restore-item');
    expect(options).toMatchObject({ method: 'POST', requestKey: null });
    expect(options.body).toBeInstanceOf(FormData);
    expect(JSON.parse(options.body.get('request'))).toMatchObject({
      backupId,
      partNumber: 1,
      item: { itemId: 'asset:photo' },
    });
    expect(options.body.get('asset:photo')).toBeInstanceOf(File);
  });
});
