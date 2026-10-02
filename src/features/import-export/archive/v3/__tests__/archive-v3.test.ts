import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  assertArchiveV3RecordLimits,
  MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES,
  MAX_ARCHIVE_ENTRY_BYTES,
} from '@/features/import-export/archive/archiveImportLimits';
import { MAX_ARCHIVE_MANIFEST_BYTES } from '@/features/import-export/archive/archiveZipRead';
import {
  calculateInventoryDigest,
  calculateItemDigest,
  calculateParentDescriptorDigest,
  canonicalJson,
  sha256Bytes,
} from '../canonical';
import {
  DEFAULT_ARCHIVE_HARD_LIMIT_BYTES,
  buildArchivePart,
  buildArchiveParts,
  exactStoreZipBytes,
  prepareArchivePlan,
  type ArchiveAssetSource,
  type ArchiveSourceItemV3,
} from '../pack';
import type {
  ArchiveItemWithoutDigestV3,
  ArchiveParentDescriptorV3,
  ArchivePartManifestV3,
  ColoringPageMetadata,
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
async function built(plan: Awaited<ReturnType<typeof prepareArchivePlan>>) {
  const output = [];
  for await (const part of buildArchiveParts(plan)) output.push(part);
  return output;
}

describe('v3 canonical format', () => {
  it('sorts object keys recursively, preserves arrays, and has stable digests', () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }], a: -0 })).toBe('{"a":0,"z":[{"a":1,"b":2}]}');
    expect(sha256Bytes(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(() => canonicalJson({ bad: Infinity })).toThrow('non-finite');
  });
  it('rejects cyclic arrays with the canonical cycle error', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => canonicalJson(cyclic)).toThrow('Canonical JSON does not allow cycles');
  });
  it('counts exact STORE bytes for UTF-8 paths', async () => {
    const entries = [
      { path: 'manifest.json', byteLength: 3 },
      { path: 'assets/a/café.jpg', byteLength: 7 },
    ];
    const zip = new JSZip();
    for (const entry of entries)
      zip.file(entry.path, new Uint8Array(entry.byteLength), {
        compression: 'STORE',
        createFolders: false,
      });
    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'STORE',
      platform: 'DOS',
    });
    expect(exactStoreZipBytes(entries)).toBe(bytes.byteLength);
  });
});

describe('v3 packer', () => {
  it('rejects an asset that the ZIP importer cannot read', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const largeAsset: ArchiveAssetSource = {
      assetId: 'large',
      path: 'assets/large/photo.jpg',
      role: 'coloring-page-photo',
      field: 'photos',
      open: async () =>
        new ReadableStream({
          start(controller) {
            for (let index = 0; index <= MAX_ARCHIVE_ENTRY_BYTES / chunk.byteLength; index++)
              controller.enqueue(chunk);
            controller.close();
          },
        }),
    };

    await expect(
      prepareArchivePlan([item('asset:large', [largeAsset])], { backupId, exportedAt })
    ).rejects.toThrow(/asset large.*too large/i);
  });

  it('stops a changed asset above the entry limit during the second pass', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let opens = 0;
    const changingAsset: ArchiveAssetSource = {
      assetId: 'changing',
      path: 'assets/changing/photo.jpg',
      role: 'coloring-page-photo',
      field: 'photos',
      open: async () => {
        opens += 1;
        return new ReadableStream({
          start(controller) {
            if (opens === 1) controller.enqueue(new Uint8Array([1]));
            else {
              for (let index = 0; index <= MAX_ARCHIVE_ENTRY_BYTES / chunk.byteLength; index++)
                controller.enqueue(chunk);
            }
            controller.close();
          },
        });
      },
    };
    const plan = await prepareArchivePlan([item('asset:changing', [changingAsset])], {
      backupId,
      exportedAt,
    });

    await expect(buildArchivePart(plan, 0)).rejects.toThrow(/asset changing.*too large/i);
  });

  it('splits before a part exceeds the ZIP central-directory limit', async () => {
    const longName = 'x'.repeat(17 * 1024);
    const items: ArchiveSourceItemV3[] = Array.from({ length: 1_000 }, (_, index) => {
      const assetId = `a${index}`;
      return item(`asset:${index}`, [
        {
          assetId,
          path: `assets/${assetId}/${longName}.jpg`,
          role: 'coloring-page-photo',
          field: 'photos',
          open: async () => stream(new Uint8Array()),
        },
      ]);
    });

    const plan = await prepareArchivePlan(items, { backupId, exportedAt });

    expect(plan.parts.length).toBeGreaterThan(1);
    expect(
      plan.parts.every(
        part =>
          46 * (part.assets.length + 1) +
            'manifest.json'.length +
            part.assets.reduce((sum, asset) => sum + asset.descriptor.path.length, 0) <=
          MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES
      )
    ).toBe(true);
  });

  it('rejects warnings above the restore count without dropping any', async () => {
    const warnings = Array.from({ length: 10_001 }, (_, index) => ({
      code: 'test',
      message: `Warning ${index}`,
    }));

    await expect(prepareArchivePlan([], { backupId, exportedAt, warnings })).rejects.toThrow(
      /too many warnings/i
    );
    expect(warnings).toHaveLength(10_001);

    const allowed = await prepareArchivePlan([], {
      backupId,
      exportedAt,
      warnings: warnings.slice(0, 10_000),
    });
    expect(allowed.parts[0].manifest.warnings).toHaveLength(10_000);
    expect(() => assertArchiveV3RecordLimits(allowed.parts[0].manifest)).not.toThrow();
  });

  it('rejects metadata lists that the v3 importer cannot accept', async () => {
    const items: ArchiveSourceItemV3[] = [
      {
        itemId: 'diamond-project:many-tags',
        kind: 'diamond-project',
        metadata: { title: 'Project', status: 'wishlist', tags: Array(1_001).fill('tag') },
        assets: [],
      },
    ];

    await expect(prepareArchivePlan(items, { backupId, exportedAt })).rejects.toThrow(
      /too many tags/i
    );
  });

  it('splits metadata-heavy items before a manifest exceeds the restore limit', async () => {
    const largeTitle = 'a'.repeat(MAX_ARCHIVE_MANIFEST_BYTES / 2);
    const items: ArchiveSourceItemV3[] = [1, 2].map(index => ({
      itemId: `diamond-project:${index}`,
      kind: 'diamond-project',
      metadata: { title: largeTitle, status: 'wishlist', tags: [] },
      assets: [],
    }));

    const plan = await prepareArchivePlan(items, { backupId, exportedAt });

    expect(plan.parts).toHaveLength(2);
    expect(
      plan.parts.every(part => part.manifestBytes.byteLength <= MAX_ARCHIVE_MANIFEST_BYTES)
    ).toBe(true);
  });

  it('rejects one atom whose manifest exceeds the restore limit', async () => {
    const items: ArchiveSourceItemV3[] = [
      {
        itemId: 'diamond-project:oversized',
        kind: 'diamond-project',
        metadata: { title: 'a'.repeat(MAX_ARCHIVE_MANIFEST_BYTES), status: 'wishlist', tags: [] },
        assets: [],
      },
    ];

    await expect(prepareArchivePlan(items, { backupId, exportedAt })).rejects.toThrow(
      /diamond-project:oversized.*manifest.*limit/
    );
  });

  it('splits asset-free items before a part exceeds the restore item limit', async () => {
    const items: ArchiveSourceItemV3[] = Array.from({ length: 10_001 }, (_, index) => ({
      itemId: `diamond-project:${index}`,
      kind: 'diamond-project',
      metadata: { title: `Project ${index}`, status: 'wishlist', tags: [] },
      assets: [],
    }));
    const plan = await prepareArchivePlan(items, { backupId, exportedAt });

    expect(plan.parts).toHaveLength(2);
    expect(plan.parts.map(part => part.manifest.items.length)).toEqual([10_000, 1]);
    for (const part of plan.parts) {
      expect(() => assertArchiveV3RecordLimits(part.manifest)).not.toThrow();
    }
  });
  it('freezes all measurements before yielding one independently readable part at a time', async () => {
    const opens: string[] = [];
    const mk = (n: number): ArchiveAssetSource => ({
      ...source(`a${n}`, `assets/a${n}/p${n}.jpg`, new Uint8Array([n, n + 1, n + 2])),
      open: async () => {
        opens.push(`a${n}`);
        return stream(new Uint8Array([n, n + 1, n + 2]), 1);
      },
    });
    const plan = await prepareArchivePlan([item('asset:1', [mk(1)]), item('asset:2', [mk(2)])], {
      backupId,
      exportedAt,
      targetBytes: 850,
      hardLimitBytes: 5000,
    });
    expect(opens).toEqual(['a1', 'a2']);
    const iterator = buildArchiveParts(plan);
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(opens.length).toBeGreaterThan(2);
    if (!first.done) {
      const zip = await JSZip.loadAsync(first.value.bytes);
      expect(JSON.parse(await zip.file('manifest.json')!.async('text')).partNumber).toBe(1);
    }
    await iterator.return(undefined);
    expect(plan.parts.every(p => p.exactByteLength <= 5000)).toBe(true);
  });
  it('splits at the exact caller target and gives an oversized-target atom a dedicated part', async () => {
    const base = await prepareArchivePlan(
      [item('asset:1', [source('a1', 'assets/a1/1.jpg', new Uint8Array(30))])],
      { backupId, exportedAt, targetBytes: 10000, hardLimitBytes: 20000 }
    );
    const one = base.parts[0].exactByteLength;
    const two = await prepareArchivePlan(
      [
        item('asset:1', [source('a1', 'assets/a1/1.jpg', new Uint8Array(30))]),
        item('asset:2', [source('a2', 'assets/a2/2.jpg', new Uint8Array(30))]),
      ],
      { backupId, exportedAt, targetBytes: one, hardLimitBytes: 20000 }
    );
    expect(two.parts).toHaveLength(2);
    expect(two.parts.map(p => p.manifest.items[0].itemId)).toEqual(['asset:1', 'asset:2']);
  });
  it('allows an exact hard cap and rejects one byte over with the item label', async () => {
    const args = [item('asset:1', [source('a1', 'assets/a1/1.jpg', new Uint8Array(5))])] as const;
    const baseline = await prepareArchivePlan(args, {
      backupId,
      exportedAt,
      targetBytes: 10000,
      hardLimitBytes: 10000,
    });
    const exact = baseline.parts[0].exactByteLength;
    await expect(
      prepareArchivePlan(args, {
        backupId,
        exportedAt,
        targetBytes: exact,
        hardLimitBytes: exact,
      })
    ).resolves.toBeTruthy();
    await expect(
      prepareArchivePlan(args, {
        backupId,
        exportedAt,
        targetBytes: exact - 1,
        hardLimitBytes: exact - 1,
      })
    ).rejects.toThrow(/asset:1.*exceeding/);
  });
  it('never allows a caller to raise the absolute 512 MiB ceiling', async () => {
    await expect(
      prepareArchivePlan([], {
        backupId,
        exportedAt,
        hardLimitBytes: DEFAULT_ARCHIVE_HARD_LIMIT_BYTES,
      })
    ).resolves.toBeTruthy();
    await expect(
      prepareArchivePlan([], {
        backupId,
        exportedAt,
        hardLimitBytes: DEFAULT_ARCHIVE_HARD_LIMIT_BYTES + 1,
      })
    ).rejects.toThrow(String(DEFAULT_ARCHIVE_HARD_LIMIT_BYTES));
  });
  it('splits on the exact entry cap without omitting items and converges across part-count digit widths', async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item(`asset:${i}`, [source(`a${i}`, `assets/a${i}/${i}.jpg`, new Uint8Array([i]))])
    );
    const plan = await prepareArchivePlan(items, {
      backupId,
      exportedAt,
      targetBytes: 100000,
      hardLimitBytes: 100000,
      maxEntries: 2,
    });
    expect(plan.parts).toHaveLength(12);
    expect(plan.parts[11].manifest.partCount).toBe(12);
    expect(plan.parts.flatMap(p => p.manifest.items.map(i => i.itemId))).toEqual(
      items.map(i => i.itemId).sort()
    );
    expect(plan.parts[0].filename).toContain('part-01-of-12');
  });
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
  it('generates byte-identical ZIPs from the same frozen plan', async () => {
    const plan = await prepareArchivePlan(
      [item('asset:1', [source('a1', 'assets/a1/1.jpg', new Uint8Array([1, 2, 3]))])],
      { backupId, exportedAt, targetBytes: 10000, hardLimitBytes: 10000 }
    );
    expect((await built(plan))[0].bytes).toEqual((await built(plan))[0].bytes);
    expect(Object.isFrozen(plan.parts[0].manifest.items)).toBe(true);
  });
  it('detaches nested caller input before freezing the plan', async () => {
    const tags = ['original'];
    const warnings = [{ code: 'test', message: 'original' }];
    const sourceItem: ArchiveSourceItemV3 = {
      itemId: 'diamond-project:p1',
      kind: 'diamond-project',
      metadata: { title: 'Project', status: 'stash', tags },
      assets: [],
    };
    const assetItem = item('asset:detached', [
      source('detached', 'assets/detached/photo.jpg', new Uint8Array([1])),
    ]);
    const callerParent = assetItem.parent!;
    const plan = await prepareArchivePlan([sourceItem, assetItem], {
      backupId,
      exportedAt,
      warnings,
    });
    expect(Object.isFrozen(tags)).toBe(false);
    expect(Object.isFrozen(warnings[0])).toBe(false);
    expect(Object.isFrozen(callerParent)).toBe(false);
    tags.push('caller mutation');
    warnings[0].message = 'caller mutation';
    (callerParent.metadata as ColoringPageMetadata).pageNumber = 99;
    const project = plan.parts[0].manifest.items.find(item => item.kind === 'diamond-project');
    const asset = plan.parts[0].manifest.items.find(entry => entry.itemId === 'asset:detached');
    expect(project?.metadata.tags).toEqual(['original']);
    expect((asset?.parent?.metadata as ColoringPageMetadata).pageNumber).toBe(1);
    expect(plan.parts[0].manifest.warnings[0].message).toBe('original');
  });
  it('produces the same canonical manifests for shuffled logical input', async () => {
    const items = dependencyFixtureItems();
    const options = { backupId, exportedAt, targetBytes: 100000, hardLimitBytes: 100000 };
    const forward = await prepareArchivePlan(items, options);
    const reverse = await prepareArchivePlan([...items].reverse(), options);
    expect(forward.parts.map(part => part.manifest)).toEqual(
      reverse.parts.map(part => part.manifest)
    );
  });
  it('serializes each logical item once during partition measurement', async () => {
    const items = Array.from(
      { length: 3000 },
      (_, index): ArchiveSourceItemV3 => ({
        itemId: `coloring-medium:${String(index).padStart(4, '0')}`,
        kind: 'coloring-medium',
        metadata: { name: `Medium ${index}`, type: 'other' },
        assets: [],
      })
    );
    const serialized: string[] = [];
    const plan = await prepareArchivePlan(items, {
      backupId,
      exportedAt,
      onPartitionItemSerialized: itemId => serialized.push(itemId),
    });
    expect(plan.logicalItemCount).toBe(3000);
    expect(serialized).toHaveLength(3000);
    expect(new Set(serialized).size).toBe(3000);
  });
  it('can rebuild one failed part independently and passes cancellation to its asset source', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const asset = source('a1', 'assets/a1/1.jpg', new Uint8Array([1]));
    asset.open = async signal => {
      signals.push(signal);
      return stream(new Uint8Array([1]));
    };
    const plan = await prepareArchivePlan([item('asset:1', [asset])], {
      backupId,
      exportedAt,
    });
    const controller = new AbortController();
    const result = await buildArchivePart(plan, 0, controller.signal);
    expect(result.manifest.partNumber).toBe(1);
    expect(signals.at(-1)).toBe(controller.signal);
    await expect(buildArchivePart(plan, 1)).rejects.toThrow('out of range');
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
  it('counts repeated dependency metadata toward splitting and hard-limit errors', async () => {
    const sourceItems = dependencyFixtureItems();
    const baseline = await prepareArchivePlan(sourceItems, {
      backupId,
      exportedAt,
      targetBytes: 100000,
      hardLimitBytes: 100000,
    });
    const dependentAtom = await prepareArchivePlan(
      [sourceItems[0], sourceItems[2], sourceItems[4]],
      { backupId, exportedAt, targetBytes: 100000, hardLimitBytes: 100000 }
    );
    const target = dependentAtom.parts[0].exactByteLength;
    const split = await prepareArchivePlan(sourceItems, {
      backupId,
      exportedAt,
      targetBytes: target,
      hardLimitBytes: 100000,
    });
    expect(split.parts.length).toBeGreaterThan(1);
    expect(baseline.parts).toHaveLength(1);
    await expect(
      prepareArchivePlan([sourceItems[0], sourceItems[2], sourceItems[4]], {
        backupId,
        exportedAt,
        targetBytes: target - 1,
        hardLimitBytes: target - 1,
      })
    ).rejects.toThrow(/asset:swatch.*required dependencies.*hard limit/);
  });
  it('fails before packing when a referenced dependency source is missing', async () => {
    const [swatch, pagePhoto, , , medium] = dependencyFixtureItems();
    await expect(prepareArchivePlan([pagePhoto], { backupId, exportedAt })).rejects.toThrow(
      'missing coloring-medium'
    );
    await expect(prepareArchivePlan([swatch, medium], { backupId, exportedAt })).rejects.toThrow(
      'missing coloring-color-reference'
    );
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
  it('accepts the strict recursive parent and exact file inventory', async () => {
    const m = await fixture();
    expect(
      validateArchiveManifestV3(m, {
        paths: new Set(['manifest.json', 'assets/a1/1.jpg']),
      })
    ).toEqual(m);
  });
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
  it('rejects missing and undeclared files', async () => {
    const m = await fixture();
    expect(() => validateArchiveManifestV3(m, { paths: new Set(['manifest.json']) })).toThrow(
      'Missing declared'
    );
    expect(() =>
      validateArchiveManifestV3(m, {
        paths: new Set(['manifest.json', 'assets/a1/1.jpg', 'extra']),
      })
    ).toThrow('Undeclared');
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
  it('rejects a supplied inventory with no measurement for a declared asset', async () => {
    const m = await fixture();
    expect(() =>
      validateArchiveManifestV3(m, {
        paths: new Set(['manifest.json', 'assets/a1/1.jpg']),
        entries: new Map(),
      })
    ).toThrow('Missing asset inventory entry');
  });
  it('rejects an asset path whose directory does not match its asset ID', async () => {
    const m = await fixture();
    m.items[0].assets[0].path = 'assets/different/1.jpg';
    resign(m);
    expect(() => validateArchiveManifestV3(m)).toThrow('does not match asset ID');
  });
  it.each(['.', '..'])('rejects the %s asset directory segment', async segment => {
    const m = await fixture();
    m.items[0].assets[0].assetId = segment;
    m.items[0].assets[0].path = `assets/${segment}/1.jpg`;
    resign(m);
    expect(() => validateArchiveManifestV3(m)).toThrow('Unsafe asset path');
  });
  it.each([null, false])('rejects an explicit malformed parent %s', async parentValue => {
    const m = await fixture();
    (m.items[0] as unknown as Record<string, unknown>).parent = parentValue;
    resign(m);
    expect(() => validateArchiveManifestV3(m)).toThrow();
  });
  it('requires manifest.json in a supplied inventory', async () => {
    const m = await fixture();
    expect(() => validateArchiveManifestV3(m, { paths: new Set(['assets/a1/1.jpg']) })).toThrow(
      'Missing manifest.json'
    );
  });
  it('rejects inconsistent duplicate parent descriptors', async () => {
    const m = await fixture();
    const copy = structuredClone(m.items[0]);
    copy.itemId = 'asset:2';
    copy.metadata = { position: 2 };
    copy.assets[0].assetId = 'a2';
    copy.assets[0].path = 'assets/a2/2.jpg';
    copy.parent!.metadata = {
      ...(copy.parent!.metadata as ColoringPageMetadata),
      pageNumber: 2,
    };
    const { digest: _parentDigest, ...parentUnsigned } = copy.parent!;
    copy.parent!.digest = calculateParentDescriptorDigest(parentUnsigned);
    const { digest: _digest, ...unsigned } = copy;
    copy.digest = calculateItemDigest(unsigned as ArchiveItemWithoutDigestV3);
    m.items.push(copy);
    const { inventoryDigest: _inventoryDigest, ...manifestUnsigned } = m;
    m.inventoryDigest = calculateInventoryDigest(manifestUnsigned);
    expect(() => validateArchiveManifestV3(m)).toThrow('Inconsistent parent descriptor');
  });
  it('rejects unsupported schemas', () =>
    expect(() => validateArchiveManifestV3({ schemaVersion: 2 })).toThrow());
});
