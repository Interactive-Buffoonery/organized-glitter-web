import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  calculateInventoryDigest,
  calculateItemDigest,
  calculateParentDescriptorDigest,
} from '../canonical';
import {
  buildArchivePart,
  buildArchiveParts,
  prepareArchivePlan,
  type ArchiveAssetSource,
  type ArchiveSourceItemV3,
} from '../pack';
import type {
  ArchiveItemWithoutDigestV3,
  ArchiveParentDescriptorV3,
  ArchivePartManifestV3,
} from '../types';
import { validateArchiveManifestV3 } from '../validate';

const backupId = '123e4567-e89b-42d3-a456-426614174000',
  exportedAt = '2026-09-22T12:00:00.000Z';
function stream(bytes: Uint8Array, chunk = bytes.length): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
}
function source(assetId: string, path: string, bytes: Uint8Array): ArchiveAssetSource {
  return {
    assetId,
    path,
    role: 'coloring-page-photo',
    field: 'photos',
    originalFilename: path.split('/').at(-1),
    open: async () => stream(bytes, 2),
  };
}
const bookMetadata = {
  title: 'Book',
  isMystery: false,
  status: 'in_stash' as const,
  totalPages: 1,
  tags: [],
};
function parent(
  kind: 'coloring-book' | 'coloring-page',
  itemId: string,
  parent?: ArchiveParentDescriptorV3
): ArchiveParentDescriptorV3 {
  const metadata =
    kind === 'coloring-book'
      ? bookMetadata
      : { pageNumber: 1, status: 'not_started' as const, mediumItemIds: [] };
  const unsigned = {
    itemId,
    kind,
    ...(parent ? { parent } : {}),
    metadata,
    assets: [],
  };
  const { assets: _, ...descriptor } = unsigned;
  return { ...descriptor, digest: calculateParentDescriptorDigest(descriptor) };
}
function item(itemId: string, assets: ArchiveAssetSource[] = []): ArchiveSourceItemV3 {
  return {
    itemId,
    kind: 'asset',
    parent: parent(
      'coloring-page',
      'coloring-page:p1',
      parent('coloring-book', 'coloring-book:b1')
    ),
    metadata: { position: Number(itemId.match(/\d+$/)?.[0] ?? 0) },
    assets,
  } as ArchiveSourceItemV3;
}
function dependencyFixtureItems(): ArchiveSourceItemV3[] {
  const book = parent('coloring-book', 'coloring-book:b1');
  const pageMetadata = {
    pageNumber: 1,
    status: 'not_started' as const,
    mediumItemIds: ['coloring-medium:m1'],
  };
  const pageUnsigned = {
    itemId: 'coloring-page:p1',
    kind: 'coloring-page' as const,
    parent: book,
    metadata: pageMetadata,
    assets: [],
  };
  const pageParent: ArchiveParentDescriptorV3 = {
    itemId: pageUnsigned.itemId,
    kind: pageUnsigned.kind,
    parent: book,
    metadata: pageMetadata,
    digest: calculateItemDigest(pageUnsigned),
  };
  const medium: ArchiveSourceItemV3 = {
    itemId: 'coloring-medium:m1',
    kind: 'coloring-medium',
    metadata: { name: 'Pencils', type: 'colored_pencil' },
    assets: [],
  };
  const page: ArchiveSourceItemV3 = pageUnsigned;
  const pagePhoto: ArchiveSourceItemV3 = {
    itemId: 'asset:page-photo',
    kind: 'asset',
    parent: pageParent,
    metadata: { position: 0 },
    assets: [source('page-photo', 'assets/page-photo/page.jpg', new Uint8Array([1]))],
  };
  const reference: ArchiveSourceItemV3 = {
    itemId: 'coloring-color-reference:r1',
    kind: 'coloring-color-reference',
    parent: pageParent,
    metadata: { notes: 'Palette' },
    assets: [],
  };
  const swatchSource = source('swatch', 'assets/swatch/swatch.jpg', new Uint8Array([2]));
  swatchSource.role = 'coloring-swatch-photo';
  const swatch: ArchiveSourceItemV3 = {
    itemId: 'asset:swatch',
    kind: 'asset',
    parent: pageParent,
    metadata: { position: 0, ownerItemId: reference.itemId },
    assets: [swatchSource],
  };
  return [swatch, pagePhoto, reference, page, medium];
}

describe('v3 packer', () => {
  it('detects pass-two length, hash, or CRC drift before yielding the changed part', async () => {
    let pass = 0;
    const changing = {
      ...source('a1', 'assets/a1/1.jpg', new Uint8Array([1, 2, 3])),
      open: async () =>
        stream(++pass === 1 ? new Uint8Array([1, 2, 3]) : new Uint8Array([1, 2, 4])),
    };
    const plan = await prepareArchivePlan([item('asset:1', [changing])], {
      backupId,
      exportedAt,
      targetBytes: 10000,
      hardLimitBytes: 10000,
    });
    await expect(async () => {
      for await (const _ of buildArchiveParts(plan)) void _;
    }).rejects.toThrow('Source data changed');
  });
  it('closes page and swatch dependencies in every independently restorable part despite shuffled source order', async () => {
    const sourceItems = dependencyFixtureItems();
    const plan = await prepareArchivePlan(sourceItems, {
      backupId,
      exportedAt,
      targetBytes: 100000,
      hardLimitBytes: 100000,
      maxEntries: 2,
    });
    expect(plan.logicalItemCount).toBe(5);
    const logicalCoverage = new Set(
      plan.parts.flatMap(part => part.manifest.items.map(entry => entry.itemId))
    );
    expect(logicalCoverage).toEqual(new Set(sourceItems.map(entry => entry.itemId)));
    for (const part of plan.parts) {
      const ids = part.manifest.items.map(entry => entry.itemId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [index, entry] of part.manifest.items.entries()) {
        if (entry.kind === 'coloring-page' || entry.parent?.kind === 'coloring-page')
          expect(ids.indexOf('coloring-medium:m1')).toBeLessThan(index);
        if (entry.kind === 'asset' && entry.metadata.ownerItemId)
          expect(ids.indexOf('coloring-color-reference:r1')).toBeLessThan(index);
      }
      validateArchiveManifestV3(part.manifest);
    }
  });
});

describe('v3 validation', () => {
  async function fixture() {
    const plan = await prepareArchivePlan(
      [item('asset:1', [source('a1', 'assets/a1/1.jpg', new Uint8Array([1]))])],
      { backupId, exportedAt, targetBytes: 10000, hardLimitBytes: 10000 }
    );
    return structuredClone(plan.parts[0].manifest);
  }
  function resign(manifest: ArchivePartManifestV3) {
    for (const entry of manifest.items) {
      const { digest: _digest, ...unsigned } = entry;
      entry.digest = calculateItemDigest(unsigned as ArchiveItemWithoutDigestV3);
    }
    const { inventoryDigest: _inventoryDigest, ...unsigned } = manifest;
    manifest.inventoryDigest = calculateInventoryDigest(unsigned);
    return manifest;
  }
  it.each([
    [
      'duplicate item',
      async (m: ArchivePartManifestV3) => {
        m.items.push(structuredClone(m.items[0]));
        resign(m);
      },
      /Duplicate item ID/,
    ],
    [
      'unsafe path',
      async (m: ArchivePartManifestV3) => {
        m.items[0].assets[0].path = '../x';
        resign(m);
      },
      /Unsafe asset path/,
    ],
    [
      'wrong item digest',
      async (m: ArchivePartManifestV3) => {
        m.items[0].digest = '0'.repeat(64);
        const { inventoryDigest: _inventoryDigest, ...u } = m;
        m.inventoryDigest = calculateInventoryDigest(u);
      },
      /Item digest mismatch/,
    ],
    [
      'wrong inventory',
      async (m: ArchivePartManifestV3) => {
        m.inventoryDigest = '0'.repeat(64);
      },
      /Inventory digest mismatch/,
    ],
    [
      'malformed identity',
      async (m: ArchivePartManifestV3) => {
        m.partId = 'wrong';
      },
      /Malformed archive part identity/,
    ],
  ])('rejects %s', async (_name, mutate, pattern) => {
    const m = await fixture();
    await mutate(m);
    expect(() => validateArchiveManifestV3(m)).toThrow(pattern);
  });
  it('rejects wrong asset byte length and raw digest', async () => {
    const m = await fixture(),
      descriptor = m.items[0].assets[0],
      paths = new Set(['manifest.json', descriptor.path]);
    expect(() =>
      validateArchiveManifestV3(m, {
        paths,
        entries: new Map([[descriptor.path, { byteLength: 2, digest: descriptor.digest }]]),
      })
    ).toThrow('length mismatch');
    expect(() =>
      validateArchiveManifestV3(m, {
        paths,
        entries: new Map([[descriptor.path, { byteLength: 1, digest: '0'.repeat(64) }]]),
      })
    ).toThrow('digest mismatch');
  });
});

it('packs and validates a color key with independent page dependencies', async () => {
  const key: ArchiveSourceItemV3 = {
    itemId: 'coloring-color-key:k1',
    kind: 'coloring-color-key',
    parent: parent(
      'coloring-page',
      'coloring-page:p1',
      parent('coloring-book', 'coloring-book:b1')
    ),
    metadata: {
      position: 0,
      symbol: 'r:abc123def456ghi',
      code: '001',
      color_name: '',
      swatch: '',
      tried: [],
      note: '',
      created: '2026-01-01 00:00:00.000Z',
      updated: '2026-01-01 00:00:00.000Z',
    },
    assets: [],
  };
  const plan = await prepareArchivePlan([key], { backupId, exportedAt });
  const part = await buildArchivePart(plan, 0);
  const zip = await JSZip.loadAsync(part.bytes);
  const manifest = validateArchiveManifestV3(
    JSON.parse(await zip.file('manifest.json')!.async('string'))
  );
  expect(manifest.items[0].metadata).toEqual(key.metadata);
});
