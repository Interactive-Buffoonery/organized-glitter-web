import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

// The packer's splitting and rejection rules do not depend on the absolute size of the shared
// restore limits, so this file shrinks them to KiB values that build in milliseconds. Only the
// packer's view changes: functions inside archiveImportLimits keep their own lexical 64 MiB and
// 16 MiB constants, and pack.ts owns ZIP_MAX_ENTRIES. archive-v3.test.ts keeps the real-limit
// importer checks and the real item-count split.
const limits = vi.hoisted(() => ({
  entryBytes: 1_024,
  manifestBytes: 16 * 1_024,
  centralDirectoryBytes: 4_096,
}));

vi.mock('@/features/import-export/archive/archiveImportLimits', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/features/import-export/archive/archiveImportLimits')
  >()),
  MAX_ARCHIVE_ENTRY_BYTES: limits.entryBytes,
  MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES: limits.centralDirectoryBytes,
}));

vi.mock('@/features/import-export/archive/archiveZipRead', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/import-export/archive/archiveZipRead')>()),
  MAX_ARCHIVE_MANIFEST_BYTES: limits.manifestBytes,
}));

import {
  MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES,
  MAX_ARCHIVE_ENTRY_BYTES,
} from '@/features/import-export/archive/archiveImportLimits';
import { MAX_ARCHIVE_MANIFEST_BYTES } from '@/features/import-export/archive/archiveZipRead';
import { calculateParentDescriptorDigest } from '../canonical';
import {
  buildArchivePart,
  buildArchiveParts,
  prepareArchivePlan,
  type ArchiveAssetSource,
  type ArchiveSourceItemV3,
} from '../pack';
import type { ArchiveParentDescriptorV3 } from '../types';
import { validateArchiveManifestV3 } from '../validate';

const backupId = '123e4567-e89b-42d3-a456-426614174000',
  exportedAt = '2026-09-22T12:00:00.000Z';

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** An unbounded source that records how many chunks the packer pulled from it. */
function endlessStream(chunkBytes: number, pulls: { count: number }): ReadableStream<Uint8Array> {
  return new ReadableStream(
    {
      pull(controller) {
        pulls.count += 1;
        controller.enqueue(new Uint8Array(chunkBytes));
      },
    },
    { highWaterMark: 0 }
  );
}

function assetSource(
  assetId: string,
  filename: string,
  open: ArchiveAssetSource['open']
): ArchiveAssetSource {
  return {
    assetId,
    path: `assets/${assetId}/${filename}`,
    role: 'coloring-page-photo',
    field: 'photos',
    open,
  };
}

function descriptor(
  kind: 'coloring-book' | 'coloring-page',
  itemId: string,
  metadata: ArchiveParentDescriptorV3['metadata'],
  parent?: ArchiveParentDescriptorV3
): ArchiveParentDescriptorV3 {
  const unsigned = { itemId, kind, ...(parent ? { parent } : {}), metadata };
  return { ...unsigned, digest: calculateParentDescriptorDigest(unsigned) };
}

function pageParent(bookTitle = 'Book'): ArchiveParentDescriptorV3 {
  const book = descriptor('coloring-book', 'coloring-book:b1', {
    title: bookTitle,
    isMystery: false,
    status: 'in_stash',
    totalPages: 1,
    tags: [],
  });
  return descriptor(
    'coloring-page',
    'coloring-page:p1',
    { pageNumber: 1, status: 'not_started', mediumItemIds: [] },
    book
  );
}

function assetItem(index: number, source: ArchiveAssetSource): ArchiveSourceItemV3 {
  return {
    itemId: `asset:${index}`,
    kind: 'asset',
    parent: pageParent(),
    metadata: { position: index },
    assets: [source],
  } as ArchiveSourceItemV3;
}

function projectItem(itemId: string, title: string): ArchiveSourceItemV3 {
  return {
    itemId,
    kind: 'diamond-project',
    metadata: { title, status: 'wishlist', tags: [] },
    assets: [],
  };
}

/** Read the central-directory size that the built ZIP declares in its end record. */
function declaredCentralDirectoryBytes(zip: Uint8Array): number {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  return view.getUint32(end + 12, true);
}

async function builtParts(plan: Awaited<ReturnType<typeof prepareArchivePlan>>) {
  const output = [];
  for await (const part of buildArchiveParts(plan)) output.push(part);
  return output;
}

describe('v3 packer at the shared restore limits', () => {
  it('sees the shrunken limits through the shared modules', () => {
    expect(MAX_ARCHIVE_ENTRY_BYTES).toBe(limits.entryBytes);
    expect(MAX_ARCHIVE_MANIFEST_BYTES).toBe(limits.manifestBytes);
    expect(MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES).toBe(limits.centralDirectoryBytes);
  });

  describe('asset entry bytes', () => {
    it('packs an asset at exactly the entry limit', async () => {
      const bytes = new Uint8Array(MAX_ARCHIVE_ENTRY_BYTES).fill(7);
      const plan = await prepareArchivePlan(
        [
          assetItem(
            1,
            assetSource('exact', 'photo.jpg', async () => bytesStream(bytes))
          ),
        ],
        { backupId, exportedAt }
      );

      expect(plan.parts[0].assets[0].descriptor.byteLength).toBe(MAX_ARCHIVE_ENTRY_BYTES);
      const part = await buildArchivePart(plan, 0);
      const zip = await JSZip.loadAsync(part.bytes);
      const packed = await zip.file('assets/exact/photo.jpg')?.async('uint8array');
      expect(packed).toEqual(bytes);
    });

    it('rejects an asset one byte over the entry limit during the first pass', async () => {
      await expect(
        prepareArchivePlan(
          [
            assetItem(
              1,
              assetSource('large', 'photo.jpg', async () =>
                bytesStream(new Uint8Array(MAX_ARCHIVE_ENTRY_BYTES + 1))
              )
            ),
          ],
          { backupId, exportedAt }
        )
      ).rejects.toThrow(/asset large.*too large/i);
    });

    it('stops reading an unbounded asset once it passes the entry limit', async () => {
      const pulls = { count: 0 };
      const chunkBytes = MAX_ARCHIVE_ENTRY_BYTES / 4;

      await expect(
        prepareArchivePlan(
          [
            assetItem(
              1,
              assetSource('endless', 'photo.jpg', async () => endlessStream(chunkBytes, pulls))
            ),
          ],
          { backupId, exportedAt }
        )
      ).rejects.toThrow(/asset endless.*too large/i);
      expect(pulls.count).toBeLessThanOrEqual(6);
    });

    it('stops a changed asset above the entry limit during the second pass', async () => {
      const pulls = { count: 0 };
      let opens = 0;
      const plan = await prepareArchivePlan(
        [
          assetItem(
            1,
            assetSource('changing', 'photo.jpg', async () => {
              opens += 1;
              return opens === 1
                ? bytesStream(new Uint8Array([1]))
                : endlessStream(MAX_ARCHIVE_ENTRY_BYTES / 4, pulls);
            })
          ),
        ],
        { backupId, exportedAt }
      );

      await expect(buildArchivePart(plan, 0)).rejects.toThrow(/asset changing.*too large/i);
      expect(opens).toBe(2);
      expect(pulls.count).toBeLessThanOrEqual(6);
    });

    it('reports a second-pass asset grown to exactly the limit as changed, not too large', async () => {
      let opens = 0;
      const plan = await prepareArchivePlan(
        [
          assetItem(
            1,
            assetSource('grown', 'photo.jpg', async () => {
              opens += 1;
              return bytesStream(new Uint8Array(opens === 1 ? 1 : MAX_ARCHIVE_ENTRY_BYTES));
            })
          ),
        ],
        { backupId, exportedAt }
      );

      await expect(buildArchivePart(plan, 0)).rejects.toThrow(/source data changed/i);
    });
  });

  describe('manifest bytes', () => {
    async function singleProjectManifestBytes(title: string): Promise<number> {
      const plan = await prepareArchivePlan([projectItem('diamond-project:sized', title)], {
        backupId,
        exportedAt,
      });
      return plan.parts[0].manifestBytes.byteLength;
    }

    it('allows a manifest at exactly the limit and rejects one byte more', async () => {
      const baseline = await singleProjectManifestBytes('a');
      const exactTitle = 'a'.repeat(1 + MAX_ARCHIVE_MANIFEST_BYTES - baseline);

      await expect(singleProjectManifestBytes(exactTitle)).resolves.toBe(
        MAX_ARCHIVE_MANIFEST_BYTES
      );
      await expect(singleProjectManifestBytes(`${exactTitle}a`)).rejects.toThrow(
        /diamond-project:sized.*manifest byte limit/
      );
    });

    it('splits metadata-heavy items before a manifest exceeds the restore limit', async () => {
      const largeTitle = 'a'.repeat(MAX_ARCHIVE_MANIFEST_BYTES / 2);
      const items = [1, 2].map(index => projectItem(`diamond-project:${index}`, largeTitle));

      const plan = await prepareArchivePlan(items, { backupId, exportedAt });

      expect(plan.parts).toHaveLength(2);
      expect(plan.parts.map(part => part.manifest.items.map(item => item.itemId))).toEqual([
        ['diamond-project:1'],
        ['diamond-project:2'],
      ]);
      for (const part of plan.parts) {
        expect(part.manifestBytes.byteLength).toBeLessThanOrEqual(MAX_ARCHIVE_MANIFEST_BYTES);
        expect(() => validateArchiveManifestV3(part.manifest)).not.toThrow();
      }
    });

    it('rejects one atom whose manifest exceeds the restore limit', async () => {
      await expect(
        prepareArchivePlan(
          [projectItem('diamond-project:oversized', 'a'.repeat(MAX_ARCHIVE_MANIFEST_BYTES))],
          { backupId, exportedAt }
        )
      ).rejects.toThrow(/diamond-project:oversized.*manifest.*limit/);
    });

    it('rejects an indivisible atom whose dependencies push its manifest over the limit', async () => {
      const parent = pageParent('b'.repeat(Math.floor(MAX_ARCHIVE_MANIFEST_BYTES * 0.6)));
      const reference: ArchiveSourceItemV3 = {
        itemId: 'coloring-color-reference:r1',
        kind: 'coloring-color-reference',
        parent,
        metadata: { notes: 'Palette' },
        assets: [],
      };
      const swatchSource = assetSource('swatch', 'swatch.jpg', async () =>
        bytesStream(new Uint8Array([2]))
      );
      swatchSource.role = 'coloring-swatch-photo';
      const swatch: ArchiveSourceItemV3 = {
        itemId: 'asset:swatch',
        kind: 'asset',
        parent,
        metadata: { position: 0, ownerItemId: reference.itemId },
        assets: [swatchSource],
      };

      const referenceOnly = await prepareArchivePlan([reference], { backupId, exportedAt });
      expect(referenceOnly.parts[0].manifestBytes.byteLength).toBeLessThanOrEqual(
        MAX_ARCHIVE_MANIFEST_BYTES
      );
      await expect(
        prepareArchivePlan([swatch, reference], { backupId, exportedAt })
      ).rejects.toThrow(/asset:swatch with required dependencies exceeds the manifest byte limit/);
    });
  });

  describe('central-directory bytes', () => {
    // JSZip stores a non-ASCII name twice: once as UTF-8 and once in the Info-ZIP Unicode path
    // extra field, so each extra ASCII character in such a path adds two directory bytes.
    const utf8Filename = (padding: number) => `café-${'x'.repeat(padding)}.jpg`;
    const oneByteAsset = (assetId: string, filename: string) =>
      assetItem(
        1,
        assetSource(assetId, filename, async () => bytesStream(new Uint8Array([1])))
      );

    it('fills the central directory to exactly the limit with a UTF-8 path and rejects more', async () => {
      const baselinePlan = await prepareArchivePlan([oneByteAsset('utf8', utf8Filename(0))], {
        backupId,
        exportedAt,
      });
      const baseline = declaredCentralDirectoryBytes(
        (await buildArchivePart(baselinePlan, 0)).bytes
      );
      const remaining = MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES - baseline;
      expect(remaining % 2).toBe(0);

      const exactPlan = await prepareArchivePlan(
        [oneByteAsset('utf8', utf8Filename(remaining / 2))],
        { backupId, exportedAt }
      );
      expect(declaredCentralDirectoryBytes((await buildArchivePart(exactPlan, 0)).bytes)).toBe(
        MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES
      );

      await expect(
        prepareArchivePlan([oneByteAsset('utf8', utf8Filename(remaining / 2 + 1))], {
          backupId,
          exportedAt,
        })
      ).rejects.toThrow(
        /asset:1 with required dependencies exceeds the central-directory byte limit/
      );
    });

    it('splits before a part exceeds the central-directory limit', async () => {
      const longName = `é${'x'.repeat(300)}.jpg`;
      const items = Array.from({ length: 8 }, (_, index) =>
        assetItem(
          index,
          assetSource(`a${index}`, longName, async () => bytesStream(new Uint8Array([index])))
        )
      );

      const plan = await prepareArchivePlan(items, { backupId, exportedAt });
      const parts = await builtParts(plan);

      expect(plan.parts.length).toBeGreaterThan(1);
      expect(
        plan.parts.flatMap(part => part.manifest.items.map(item => item.itemId)).sort()
      ).toEqual(items.map(item => item.itemId).sort());
      // The manifest limit is not what split these parts.
      expect(plan.parts.reduce((sum, part) => sum + part.manifestBytes.byteLength, 0)).toBeLessThan(
        MAX_ARCHIVE_MANIFEST_BYTES
      );
      for (const part of parts) {
        expect(declaredCentralDirectoryBytes(part.bytes)).toBeLessThanOrEqual(
          MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES
        );
      }
    });
  });
});
