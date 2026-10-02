import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateInventoryDigest,
  calculateItemDigest,
  sha256Bytes,
} from '@/features/import-export/archive/v3/canonical';
import { importArchiveV3Parts } from './import';
import type { ArchiveRestoreCapabilities } from '@/services/pocketbase/archiveRestoreV3.service';
import type {
  ArchiveItemV3,
  ArchivePartManifestV3,
} from '@/features/import-export/archive/v3/types';

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

async function rawManifestPart(manifest: string): Promise<File> {
  const zip = new JSZip();
  zip.file('manifest.json', manifest);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], 'invalid-part.zip', { type: 'application/zip' });
}

function session(currentUser = { id: 'user-1' }) {
  return {
    userId: 'user-1',
    getCurrentUserId: () => currentUser.id,
  };
}

describe('v3 archive import preflight', () => {
  it('rejects a warning flood before validating v3 items or writing', async () => {
    const restoreItem = vi.fn();
    const file = await rawManifestPart(
      JSON.stringify({
        schemaVersion: 3,
        items: [],
        warnings: Array(10_001).fill({ code: 'test', message: '' }),
      })
    );

    await expect(
      importArchiveV3Parts([file], {
        capabilities,
        adapter: { restoreItem },
        session: session(),
      })
    ).rejects.toThrow(/too many warnings/i);
    expect(restoreItem).not.toHaveBeenCalled();
  });

  it.each([
    ['null', 'Unsupported or invalid archive schema version'],
    ['[]', 'Unsupported or invalid archive schema version'],
    ['{"schemaVersion":2}', 'Unsupported or invalid archive schema version'],
    ['{', 'Invalid archive manifest JSON'],
  ])('rejects invalid v3 manifest %s before restoring any selected part', async (json, error) => {
    const restoreItem = vi.fn();
    const valid = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [projectItem('project:1')],
    });
    const invalid = await rawManifestPart(json);

    await expect(
      importArchiveV3Parts([valid, invalid], {
        capabilities,
        adapter: { restoreItem },
        session: session(),
      })
    ).rejects.toThrow(error);
    expect(restoreItem).not.toHaveBeenCalled();
  });

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

  it('rejects server upload limits across the selected set before writing', async () => {
    const restoreItem = vi.fn();
    const first = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [projectItem('project:1')],
    });
    const second = await archivePart({
      partNumber: 2,
      partCount: 2,
      items: [assetItem(new Uint8Array([1, 2, 3]))],
      assetBytes: new Uint8Array([1, 2, 3]),
    });
    await expect(
      importArchiveV3Parts([first, second], {
        capabilities: {
          ...capabilities,
          maxAssetBytesByRole: {
            ...capabilities.maxAssetBytesByRole,
            'coloring-page-photo': 2,
          },
        },
        adapter: { restoreItem },
        session: session(),
      })
    ).rejects.toThrow(/server upload limit/i);
    expect(restoreItem).not.toHaveBeenCalled();
  });

  it('rejects duplicate part indexes even when their inventories match', async () => {
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [projectItem('project:1')],
    });
    await expect(
      importArchiveV3Parts([file, file], {
        capabilities,
        adapter: { restoreItem: vi.fn() },
        session: session(),
      })
    ).rejects.toThrow(/selected more than once/i);
  });
});

describe('v3 archive restore accounting', () => {
  it('rejects an asset that grows after preflight before the server write', async () => {
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [assetItem(new Uint8Array([1]))],
      assetBytes: new Uint8Array([1]),
    });
    const originalLoadAsync = JSZip.loadAsync.bind(JSZip);
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    let loadCount = 0;
    loadAsync.mockImplementation(async (...args) => {
      const zip = await originalLoadAsync(...args);
      if (++loadCount === 2) zip.file('assets/photo-1/photo.jpg', new Uint8Array([1, 2]));
      return zip;
    });
    const restoreItem = vi.fn();

    try {
      const result = await importArchiveV3Parts([file], {
        capabilities: {
          ...capabilities,
          maxAssetBytesByRole: { ...capabilities.maxAssetBytesByRole, 'coloring-page-photo': 1 },
        },
        adapter: { restoreItem },
        session: session(),
      });

      expect(result.errors).toEqual([
        expect.objectContaining({
          itemId: 'asset:photo-1',
          message: expect.stringMatching(/too large/i),
        }),
      ]);
      expect(restoreItem).not.toHaveBeenCalled();
    } finally {
      loadAsync.mockRestore();
    }
  });

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
    expect(result.alreadyAppliedItemCount).toBe(1);
  });

  it('counts parent scaffolds created by a child restore response', async () => {
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [projectItem('project:child')],
    });
    const restoreItem = vi.fn().mockResolvedValue({
      outcome: 'created',
      itemId: 'project:child',
      targetRecordId: 'target-child',
      scaffoldedParentCount: 1,
      assetOutcomes: [],
    });

    const result = await importArchiveV3Parts([file], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(result.createdItemCount).toBe(1);
    expect(result.scaffoldedItemCount).toBe(1);
  });

  it('reopens one immutable part at a time after whole-set preflight', async () => {
    const first = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [projectItem('project:1')],
    });
    const second = await archivePart({
      partNumber: 2,
      partCount: 2,
      items: [projectItem('project:2')],
    });
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    const restoreItem = vi.fn(async ({ request }) => ({
      outcome: 'created' as const,
      itemId: request.item.itemId,
      targetRecordId: `target-${request.item.itemId}`,
      assetOutcomes: [],
    }));

    await importArchiveV3Parts([first, second], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(loadAsync).toHaveBeenCalledTimes(4);
    expect(restoreItem).toHaveBeenCalledTimes(2);
    loadAsync.mockRestore();
  });

  it('imports a selected part independently and reports missing parts without claiming full coverage', async () => {
    const file = await archivePart({
      partNumber: 2,
      partCount: 3,
      items: [projectItem('project:1'), projectItem('project:2')],
    });
    const restoreItem = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'already_applied',
        itemId: 'project:1',
        targetRecordId: 'target-1',
        assetOutcomes: [],
      })
      .mockResolvedValueOnce({
        outcome: 'created',
        itemId: 'project:2',
        targetRecordId: 'target-2',
        assetOutcomes: [],
      });

    const result = await importArchiveV3Parts([file], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(result).toMatchObject({
      success: true,
      selectedPartNumbers: [2],
      missingPartNumbers: [1, 3],
      selectedPartCount: 1,
      totalPartCount: 3,
      selectedLogicalItemCount: 2,
      createdItemCount: 1,
      alreadyAppliedItemCount: 1,
    });
    expect(restoreItem).toHaveBeenCalledTimes(2);
  });

  it('reports a server conflict per item and continues with later independent items', async () => {
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [projectItem('project:1'), projectItem('project:2')],
    });
    const conflict = Object.assign(new Error('Project was edited after its restore scaffold'), {
      status: 409,
      response: { data: { reason: 'archive_parent_descriptor_conflict' } },
    });
    const restoreItem = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce({
      outcome: 'created',
      itemId: 'project:2',
      targetRecordId: 'target-2',
      assetOutcomes: [],
    });

    const result = await importArchiveV3Parts([file], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(result.success).toBe(false);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ itemId: 'project:1', kind: 'conflict' }),
    ]);
    expect(result.createdItemCount).toBe(1);
    expect(restoreItem).toHaveBeenCalledTimes(2);
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

  it('keeps confirmed counts when cancellation occurs after the last item of a part', async () => {
    const first = await archivePart({
      partNumber: 1,
      partCount: 2,
      items: [projectItem('project:1')],
    });
    const second = await archivePart({
      partNumber: 2,
      partCount: 2,
      items: [projectItem('project:2')],
    });
    const controller = new AbortController();
    const restoreItem = vi.fn().mockResolvedValue({
      outcome: 'created',
      itemId: 'project:1',
      targetRecordId: 'target-1',
      assetOutcomes: [],
    });

    const result = await importArchiveV3Parts([first, second], {
      capabilities,
      adapter: { restoreItem },
      session: { ...session(), signal: controller.signal },
      onProgress: progress => {
        if (progress.phase === 'restore' && progress.completed === 1) controller.abort();
      },
    });

    expect(restoreItem).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, createdItemCount: 1 });
    expect(result.itemResults).toHaveLength(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ partNumber: 2, itemId: 'project:2', kind: 'cancelled' }),
    ]);
  });

  it.each([
    ['offline', Object.assign(new Error('Network request failed'), { status: 0 })],
    ['unauthorized', Object.assign(new Error('Unauthorized'), { status: 401 })],
    ['forbidden', Object.assign(new Error('Forbidden'), { status: 403 })],
  ])('stops after a %s failure without requesting the next item', async (_label, failure) => {
    const file = await archivePart({
      partNumber: 1,
      partCount: 1,
      items: [projectItem('project:1'), projectItem('project:2')],
    });
    const restoreItem = vi.fn().mockRejectedValueOnce(failure);

    const result = await importArchiveV3Parts([file], {
      capabilities,
      adapter: { restoreItem },
      session: session(),
    });

    expect(restoreItem).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, createdItemCount: 0 });
    expect(result.errors).toEqual([
      expect.objectContaining({ itemId: 'project:1', kind: 'failed' }),
    ]);
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
