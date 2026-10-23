import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateInventoryDigest,
  calculateItemDigest,
  sha256Bytes,
} from '@/features/import-export/archive/v3/canonical';
import type {
  ArchiveItemV3,
  ArchivePartManifestV3,
} from '@/features/import-export/archive/v3/types';
import type { ArchiveRestoreCapabilities } from '@/services/pocketbase/archiveRestoreV3.service';
import { importArchiveV3Parts } from './import';

const backupId = '123e4567-e89b-42d3-a456-426614174000';
const exportedAt = '2026-09-22T12:00:00.000Z';
const capabilities: ArchiveRestoreCapabilities = {
  restoreSchemaVersions: [1, 2, 3],
  multipartRestore: true,
  maxPartBytes: 512 * 1024 * 1024,
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
};

function projectItem(itemId: string): ArchiveItemV3 {
  const unsigned = {
    itemId,
    kind: 'diamond-project' as const,
    metadata: { title: itemId, status: 'purchased' as const, tags: [] },
    assets: [],
  };
  return { ...unsigned, digest: calculateItemDigest(unsigned) };
}

function assetItem(bytes: Uint8Array): ArchiveItemV3 {
  const bookUnsigned = {
    itemId: 'coloring-book:b1',
    kind: 'coloring-book' as const,
    metadata: {
      title: 'Book',
      isMystery: false,
      status: 'in_stash' as const,
      totalPages: 1,
      tags: [],
    },
    assets: [],
  };
  const { assets: _bookAssets, ...bookDescriptor } = bookUnsigned;
  const book = { ...bookDescriptor, digest: calculateItemDigest(bookUnsigned) };
  const pageUnsigned = {
    itemId: 'coloring-page:p1',
    kind: 'coloring-page' as const,
    parent: book,
    metadata: {
      pageNumber: 1,
      status: 'not_started' as const,
      mediumItemIds: [],
    },
    assets: [],
  };
  const { assets: _pageAssets, ...pageDescriptor } = pageUnsigned;
  const page = { ...pageDescriptor, digest: calculateItemDigest(pageUnsigned) };
  const unsigned = {
    itemId: 'asset:photo-1',
    kind: 'asset' as const,
    parent: page,
    metadata: { position: 0 },
    assets: [
      {
        assetId: 'photo-1',
        digest: sha256Bytes(bytes),
        byteLength: bytes.byteLength,
        path: 'assets/photo-1/photo.jpg',
        role: 'coloring-page-photo' as const,
        field: 'photos',
        originalFilename: 'photo.jpg',
      },
    ],
  };
  return { ...unsigned, digest: calculateItemDigest(unsigned) };
}

async function archivePart(input: {
  partNumber: number;
  partCount: number;
  items: ArchiveItemV3[];
  backup?: string;
  assetBytes?: Uint8Array;
}): Promise<File> {
  const unsigned = {
    schemaVersion: 3 as const,
    source: 'organized-glitter' as const,
    backupId: input.backup ?? backupId,
    exportedAt,
    partNumber: input.partNumber,
    partCount: input.partCount,
    partId: `${input.backup ?? backupId}:${input.partNumber}`,
    items: input.items,
    warnings: [],
  };
  const manifest: ArchivePartManifestV3 = {
    ...unsigned,
    inventoryDigest: calculateInventoryDigest(unsigned),
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const item of input.items) {
    for (const asset of item.assets) {
      zip.file(asset.path, input.assetBytes ?? new Uint8Array([1, 2, 3]));
    }
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], `part-${input.partNumber}.zip`, { type: 'application/zip' });
}

function session(currentUser = { id: 'user-1' }) {
  return {
    userId: 'user-1',
    getCurrentUserId: () => currentUser.id,
  };
}

describe('v3 archive import preflight', () => {
  it('rejects a mixed backup set before the first server write', async () => {
    const restoreItem = vi.fn();
    const first = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [projectItem('project:1')],
    });
    const second = await archivePart({
      partNumber: 2,
      partCount: 2,
      items: [projectItem('project:2')],
      backup: '223e4567-e89b-42d3-a456-426614174000',
    });

    await expect(
      importArchiveV3Parts([first, second], {
        capabilities,
        adapter: { restoreItem },
        session: session(),
      })
    ).rejects.toThrow(/same backup set/i);
    expect(restoreItem).not.toHaveBeenCalled();
  });

  it('verifies every selected asset digest before the first server write', async () => {
    const restoreItem = vi.fn();
    const first = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [projectItem('project:1')],
    });
    const item = assetItem(new Uint8Array([1, 2, 3]));
    const second = await archivePart({
      partNumber: 2,
      partCount: 2,
      items: [item],
      assetBytes: new Uint8Array([9, 9, 9]),
    });

    await expect(
      importArchiveV3Parts([first, second], {
        capabilities,
        adapter: { restoreItem },
        session: session(),
      })
    ).rejects.toThrow(/asset digest mismatch/i);
    expect(restoreItem).not.toHaveBeenCalled();
  });
});

describe('v3 archive restore accounting', () => {
  it('accepts repeated dependency items across parts and counts the retry response', async () => {
    const dependency = projectItem('project:shared');
    const first = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [dependency],
    });
    const second = await archivePart({
      partNumber: 2,
      partCount: 2,
      items: [dependency],
    });
    const restoreItem = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'created',
        itemId: dependency.itemId,
        targetRecordId: 'target-1',
        assetOutcomes: [],
      })
      .mockResolvedValueOnce({
        outcome: 'already_applied',
        itemId: dependency.itemId,
        targetRecordId: 'target-1',
        assetOutcomes: [],
      });

    const result = await importArchiveV3Parts([first, second], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(result.selectedLogicalItemCount).toBe(1);
    expect(result.createdItemCount).toBe(1);
    expect(result.createdLibraryItemCount).toBe(1);
    expect(result.alreadyAppliedItemCount).toBe(1);
  });

  it('stops before another write when the authenticated account changes', async () => {
    const currentUser = { id: 'user-1' };
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [projectItem('project:1'), projectItem('project:2')],
    });
    const restoreItem = vi.fn().mockImplementation(async () => {
      currentUser.id = 'user-2';
      return {
        outcome: 'created',
        itemId: 'project:1',
        targetRecordId: 'target-1',
        assetOutcomes: [],
      };
    });
    const onProgress = vi.fn();

    const result = await importArchiveV3Parts([file], {
      capabilities,
      adapter: { restoreItem },
      session: session(currentUser),
      onProgress,
    });

    expect(restoreItem).toHaveBeenCalledTimes(1);
    expect(result.createdItemCount).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ itemId: 'project:1', kind: 'cancelled' }),
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({
      phase: 'restore',
      completed: 1,
      total: 2,
      partNumber: 1,
      itemId: 'project:1',
    });
  });

  it('keeps a confirmed write when a later transport failure stops restore', async () => {
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [projectItem('project:1'), projectItem('project:2'), projectItem('project:3')],
    });
    const restoreItem = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'created',
        itemId: 'project:1',
        targetRecordId: 'target-1',
        assetOutcomes: [],
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await importArchiveV3Parts([file], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(restoreItem).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: false, createdItemCount: 1 });
    expect(result.itemResults).toHaveLength(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ itemId: 'project:2', kind: 'failed' }),
    ]);
  });
});
