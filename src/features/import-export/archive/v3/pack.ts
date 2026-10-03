import JSZip from 'jszip';
import { Hash } from 'fast-sha256';
import {
  assertArchiveV3RecordLimits,
  MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_TOP_LEVEL_RECORDS,
} from '@/features/import-export/archive/archiveImportLimits';
import { MAX_ARCHIVE_MANIFEST_BYTES } from '@/features/import-export/archive/archiveZipRead';
import {
  calculateInventoryDigest,
  calculateItemDigest,
  bytesToHex,
  canonicalJson,
} from './canonical';
import type {
  ArchiveAssetDescriptorV3,
  ArchiveItemKind,
  ArchiveItemV3,
  ArchiveItemWithoutDigestV3,
  ArchivePartManifestV3,
  ArchiveWarning,
  ColoringPageMetadata,
} from './types';
import { validateArchiveManifestV3 } from './validate';

const DEFAULT_ARCHIVE_TARGET_BYTES = 128 * 1024 * 1024;
export const DEFAULT_ARCHIVE_HARD_LIMIT_BYTES = 512 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 10_000;
const MANIFEST_PATH = 'manifest.json';
const encoder = new TextEncoder();
function deterministicZipDate(): Date {
  return new Date(1980, 0, 1, 0, 0, 0, 0);
}

export interface ArchiveAssetSource {
  assetId: string;
  path: string;
  role: ArchiveAssetDescriptorV3['role'];
  field: string;
  originalFilename?: string;
  contentType?: string;
  open(signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}

export type ArchiveSourceItemV3 = {
  [K in ArchiveItemKind]: Omit<Extract<ArchiveItemWithoutDigestV3, { kind: K }>, 'assets'> & {
    assets: ArchiveAssetSource[];
  };
}[ArchiveItemKind];

interface MeasuredAsset {
  descriptor: ArchiveAssetDescriptorV3;
  crc32: number;
  source: ArchiveAssetSource;
}

interface MeasuredItem {
  item: ArchiveItemV3;
  assets: MeasuredAsset[];
  canonicalByteLength: number;
}

interface PackingAtom {
  primary: MeasuredItem;
  dependencies: MeasuredItem[];
}

export interface ArchivePackOptions {
  backupId: string;
  exportedAt: string;
  appVersion?: string;
  warnings?: ArchiveWarning[];
  targetBytes?: number;
  hardLimitBytes?: number;
  maxEntries?: number;
  signal?: AbortSignal;
  /** Diagnostic hook used to verify partition planning remains linear. */
  onPartitionItemSerialized?: (itemId: string) => void;
}

export interface ArchivePartPlan {
  manifest: ArchivePartManifestV3;
  manifestBytes: Uint8Array;
  exactByteLength: number;
  filename: string;
  /** Internal pass-two sources; consumers should treat the plan as immutable. */
  assets: readonly MeasuredAsset[];
}

export interface ArchivePlanV3 {
  backupId: string;
  parts: readonly ArchivePartPlan[];
  hardLimitBytes: number;
  logicalItemCount: number;
}

export interface BuiltArchivePart {
  manifest: ArchivePartManifestV3;
  filename: string;
  bytes: Uint8Array;
}

function validateLimits(target: number, hard: number, maxEntries: number): void {
  if (!Number.isSafeInteger(target) || target <= 0)
    throw new Error('Archive target must be a positive safe integer');
  if (
    !Number.isSafeInteger(hard) ||
    hard <= 0 ||
    hard > DEFAULT_ARCHIVE_HARD_LIMIT_BYTES ||
    target > hard
  )
    throw new Error(
      `Archive hard limit must be a safe integer between the target and ${DEFAULT_ARCHIVE_HARD_LIMIT_BYTES}`
    );
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 2 || maxEntries > ZIP_MAX_ENTRIES)
    throw new Error(`ZIP entry cap must be between 2 and ${ZIP_MAX_ENTRIES}`);
}

let crcTable: Uint32Array | undefined;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}
function crc32Update(crc: number, bytes: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  const t = table();
  for (const byte of bytes) c = t[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function measure(source: ArchiveAssetSource, signal?: AbortSignal): Promise<MeasuredAsset> {
  signal?.throwIfAborted();
  const reader = (await source.open(signal)).getReader();
  const hash = new Hash();
  let length = 0,
    crc = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array))
        throw new Error(`Asset ${source.assetId} returned a non-byte chunk`);
      length += value.byteLength;
      if (length > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Asset ${source.assetId} is too large`);
      if (!Number.isSafeInteger(length)) throw new Error(`Asset ${source.assetId} is too large`);
      hash.update(value);
      crc = crc32Update(crc, value);
    }
  } finally {
    reader.releaseLock();
  }
  return {
    source,
    crc32: crc,
    descriptor: Object.freeze({
      assetId: source.assetId,
      path: source.path,
      role: source.role,
      field: source.field,
      digest: bytesToHex(hash.digest()),
      byteLength: length,
      ...(source.originalFilename === undefined
        ? {}
        : { originalFilename: source.originalFilename }),
      ...(source.contentType === undefined ? {} : { contentType: source.contentType }),
    }),
  };
}

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength;
}
/** Exact contribution generated by JSZip 3.10 for a STORE entry with its default UTF-8 encoder. */
function exactStoreEntryBytes(path: string, dataBytes: number): number {
  const { nameBytes, unicodeExtra } = zipPathBytes(path);
  return dataBytes + 76 + 2 * nameBytes + 2 * unicodeExtra;
}
function centralDirectoryEntryBytes(path: string): number {
  const { nameBytes, unicodeExtra } = zipPathBytes(path);
  return 46 + nameBytes + unicodeExtra;
}
function zipPathBytes(path: string): { nameBytes: number; unicodeExtra: number } {
  const nameBytes = utf8Length(path);
  return { nameBytes, unicodeExtra: nameBytes === path.length ? 0 : 9 + nameBytes };
}
export function exactStoreZipBytes(
  entries: readonly { path: string; byteLength: number }[]
): number {
  return (
    22 + entries.reduce((sum, entry) => sum + exactStoreEntryBytes(entry.path, entry.byteLength), 0)
  );
}

function manifestFor(
  items: ArchiveItemV3[],
  options: ArchivePackOptions,
  partNumber: number,
  partCount: number
): { manifest: ArchivePartManifestV3; bytes: Uint8Array } {
  const unsigned: Omit<ArchivePartManifestV3, 'inventoryDigest'> = {
    schemaVersion: 3,
    source: 'organized-glitter',
    backupId: options.backupId,
    exportedAt: options.exportedAt,
    ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
    partNumber,
    partCount,
    partId: `${options.backupId}:${partNumber}`,
    items,
    warnings: options.warnings ?? [],
  };
  const manifest = {
    ...unsigned,
    inventoryDigest: calculateInventoryDigest(unsigned),
  };
  return { manifest, bytes: encoder.encode(canonicalJson(manifest)) };
}

function finalPart(
  atoms: readonly PackingAtom[],
  options: ArchivePackOptions,
  n: number,
  count: number
): {
  manifest: ArchivePartManifestV3;
  bytes: Uint8Array;
  size: number;
  entries: number;
  centralDirectoryBytes: number;
} {
  const items = expandAtoms(atoms);
  const { manifest, bytes } = manifestFor(
    items.map(i => i.item),
    options,
    n,
    count
  );
  const assets = items.flatMap(i => i.assets);
  return {
    manifest,
    bytes,
    size: exactStoreZipBytes([
      { path: MANIFEST_PATH, byteLength: bytes.byteLength },
      ...assets.map(a => ({
        path: a.descriptor.path,
        byteLength: a.descriptor.byteLength,
      })),
    ]),
    entries: 1 + assets.length,
    centralDirectoryBytes:
      centralDirectoryEntryBytes(MANIFEST_PATH) +
      assets.reduce((sum, asset) => sum + centralDirectoryEntryBytes(asset.descriptor.path), 0),
  };
}

function expandAtoms(atoms: readonly PackingAtom[]): MeasuredItem[] {
  const included = new Set<string>();
  const result: MeasuredItem[] = [];
  for (const atom of atoms) {
    for (const item of [...atom.dependencies, atom.primary]) {
      if (included.has(item.item.itemId)) continue;
      included.add(item.item.itemId);
      result.push(item);
    }
  }
  return result;
}

interface PartMeasure {
  atoms: PackingAtom[];
  included: Set<string>;
  itemCount: number;
  itemBytes: number;
  assetEntryBytes: number;
  centralDirectoryBytes: number;
  entries: number;
  manifestBaseBytes: number;
}

function emptyPartMeasure(
  options: ArchivePackOptions,
  partNumber: number,
  partCount: number
): PartMeasure {
  return {
    atoms: [],
    included: new Set(),
    itemCount: 0,
    itemBytes: 0,
    assetEntryBytes: 0,
    centralDirectoryBytes: centralDirectoryEntryBytes(MANIFEST_PATH),
    entries: 1,
    manifestBaseBytes: manifestFor([], options, partNumber, partCount).bytes.byteLength,
  };
}

function additionsFor(atom: PackingAtom, included: ReadonlySet<string>): MeasuredItem[] {
  const additions: MeasuredItem[] = [];
  const pending = new Set<string>();
  for (const item of [...atom.dependencies, atom.primary]) {
    if (included.has(item.item.itemId) || pending.has(item.item.itemId)) continue;
    pending.add(item.item.itemId);
    additions.push(item);
  }
  return additions;
}

function measuredManifestBytes(
  measure: PartMeasure,
  additions: readonly MeasuredItem[] = []
): number {
  const addedItemBytes = additions.reduce((sum, item) => sum + item.canonicalByteLength, 0);
  const itemCount = measure.itemCount + additions.length;
  return (
    measure.manifestBaseBytes + measure.itemBytes + addedItemBytes + Math.max(0, itemCount - 1)
  );
}

function measuredZipBytes(measure: PartMeasure, additions: readonly MeasuredItem[] = []): number {
  const addedAssets = additions.flatMap(item => item.assets);
  return (
    22 +
    exactStoreEntryBytes(MANIFEST_PATH, measuredManifestBytes(measure, additions)) +
    measure.assetEntryBytes +
    addedAssets.reduce(
      (sum, asset) =>
        sum + exactStoreEntryBytes(asset.descriptor.path, asset.descriptor.byteLength),
      0
    )
  );
}

function measuredCentralDirectoryBytes(
  measure: PartMeasure,
  additions: readonly MeasuredItem[] = []
): number {
  return (
    measure.centralDirectoryBytes +
    additions.reduce(
      (sum, item) =>
        sum +
        item.assets.reduce(
          (assetSum, asset) => assetSum + centralDirectoryEntryBytes(asset.descriptor.path),
          0
        ),
      0
    )
  );
}

function addAtom(
  measure: PartMeasure,
  atom: PackingAtom,
  additions: readonly MeasuredItem[]
): void {
  measure.atoms.push(atom);
  for (const item of additions) {
    measure.included.add(item.item.itemId);
    measure.itemCount += 1;
    measure.itemBytes += item.canonicalByteLength;
    for (const asset of item.assets) {
      measure.entries += 1;
      measure.centralDirectoryBytes += centralDirectoryEntryBytes(asset.descriptor.path);
      measure.assetEntryBytes += exactStoreEntryBytes(
        asset.descriptor.path,
        asset.descriptor.byteLength
      );
    }
  }
}

function partition(
  atoms: readonly PackingAtom[],
  options: ArchivePackOptions,
  assumedCount: number
): PackingAtom[][] {
  const target = options.targetBytes ?? DEFAULT_ARCHIVE_TARGET_BYTES,
    hard = options.hardLimitBytes ?? DEFAULT_ARCHIVE_HARD_LIMIT_BYTES,
    cap = options.maxEntries ?? ZIP_MAX_ENTRIES;
  const parts: PackingAtom[][] = [];
  let current = emptyPartMeasure(options, 1, assumedCount);
  for (const atom of atoms) {
    const standalone = emptyPartMeasure(options, parts.length + 1, assumedCount);
    const standaloneAdditions = additionsFor(atom, standalone.included);
    const atomBytes = measuredZipBytes(standalone, standaloneAdditions);
    const atomEntries =
      standalone.entries + standaloneAdditions.flatMap(item => item.assets).length;
    if (atomBytes > hard)
      throw new Error(
        `Archive item ${atom.primary.item.itemId} with required dependencies requires ${atomBytes} bytes, exceeding the ${hard}-byte hard limit`
      );
    if (measuredManifestBytes(standalone, standaloneAdditions) > MAX_ARCHIVE_MANIFEST_BYTES)
      throw new Error(
        `Archive item ${atom.primary.item.itemId} with required dependencies exceeds the manifest byte limit`
      );
    if (
      measuredCentralDirectoryBytes(standalone, standaloneAdditions) >
      MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES
    )
      throw new Error(
        `Archive item ${atom.primary.item.itemId} with required dependencies exceeds the central-directory byte limit`
      );
    if (atomEntries > cap)
      throw new Error(
        `Archive item ${atom.primary.item.itemId} with required dependencies requires ${atomEntries} ZIP entries, exceeding the ${cap}-entry limit`
      );
    if (standalone.itemCount + standaloneAdditions.length > ZIP_MAX_ENTRIES) {
      throw new Error(`Archive item ${atom.primary.item.itemId} requires too many manifest items`);
    }
    const additions = additionsFor(atom, current.included);
    const candidateBytes = measuredZipBytes(current, additions);
    const candidateEntries = current.entries + additions.flatMap(item => item.assets).length;
    const candidateItems = current.itemCount + additions.length;
    if (
      current.atoms.length > 0 &&
      (candidateBytes > target ||
        measuredManifestBytes(current, additions) > MAX_ARCHIVE_MANIFEST_BYTES ||
        measuredCentralDirectoryBytes(current, additions) > MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES ||
        candidateEntries > cap ||
        candidateItems > ZIP_MAX_ENTRIES)
    ) {
      parts.push(current.atoms);
      current = emptyPartMeasure(options, parts.length + 1, assumedCount);
      addAtom(current, atom, additionsFor(atom, current.included));
    } else addAtom(current, atom, additions);
  }
  if (current.atoms.length) parts.push(current.atoms);
  if (parts.length === 0) parts.push([]);
  return parts;
}

function freezePlan(atoms: readonly PackingAtom[], options: ArchivePackOptions): ArchivePlanV3 {
  const hard = options.hardLimitBytes ?? DEFAULT_ARCHIVE_HARD_LIMIT_BYTES;
  let assumed = 1;
  let groups: PackingAtom[][] = [];
  // The assumed count only grows. Its decimal width can increase manifest bytes and split parts,
  // while the finite item count bounds convergence without an arbitrary retry limit.
  for (;;) {
    groups = partition(atoms, options, assumed);
    if (groups.length <= assumed) break;
    assumed = groups.length;
  }
  const count = groups.length,
    width = Math.max(2, String(count).length);
  const parts = groups.map((group, index) => {
    const measured = finalPart(group, options, index + 1, count);
    if (measured.size > hard)
      throw new Error(
        `Archive part ${index + 1} requires ${measured.size} bytes, exceeding the ${hard}-byte hard limit`
      );
    if (measured.bytes.byteLength > MAX_ARCHIVE_MANIFEST_BYTES)
      throw new Error(`Archive part ${index + 1} exceeds the manifest byte limit`);
    if (measured.centralDirectoryBytes > MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES)
      throw new Error(`Archive part ${index + 1} exceeds the central-directory byte limit`);
    assertArchiveV3RecordLimits(measured.manifest);
    validateArchiveManifestV3(measured.manifest);
    return Object.freeze({
      manifest: deepFreeze(measured.manifest),
      manifestBytes: measured.bytes,
      exactByteLength: measured.size,
      filename: `organized-glitter-backup-${options.backupId}-part-${String(index + 1).padStart(width, '0')}-of-${String(count).padStart(width, '0')}.zip`,
      assets: Object.freeze(
        expandAtoms(group)
          .flatMap(i => i.assets)
          .map(asset => Object.freeze(asset))
      ),
    });
  });
  return Object.freeze({
    backupId: options.backupId,
    parts: Object.freeze(parts),
    hardLimitBytes: hard,
    logicalItemCount: atoms.length,
  });
}

function pageMetadataFor(item: ArchiveItemV3): ColoringPageMetadata | undefined {
  if (item.kind === 'coloring-page') return item.metadata;
  if (item.parent?.kind === 'coloring-page') return item.parent.metadata as ColoringPageMetadata;
  return undefined;
}

function buildPackingAtoms(items: readonly MeasuredItem[]): PackingAtom[] {
  const byId = new Map<string, MeasuredItem>();
  for (const measured of items) {
    if (byId.has(measured.item.itemId))
      throw new Error(`Duplicate source item ID: ${measured.item.itemId}`);
    byId.set(measured.item.itemId, measured);
  }
  return [...items].sort(compareMeasuredItems).map(primary => {
    const dependencies: MeasuredItem[] = [];
    const pageMetadata = pageMetadataFor(primary.item);
    if (pageMetadata) {
      for (const mediumItemId of [...pageMetadata.mediumItemIds].sort(compareCodePoints)) {
        const medium = byId.get(mediumItemId);
        if (!medium || medium.item.kind !== 'coloring-medium')
          throw new Error(
            `Archive item ${primary.item.itemId} requires missing coloring-medium ${mediumItemId}`
          );
        dependencies.push(medium);
      }
    }
    if (primary.item.kind === 'asset' && primary.item.assets[0]?.role === 'coloring-swatch-photo') {
      const ownerItemId = primary.item.metadata.ownerItemId;
      const owner = ownerItemId ? byId.get(ownerItemId) : undefined;
      if (!owner || owner.item.kind !== 'coloring-color-reference')
        throw new Error(
          `Archive item ${primary.item.itemId} requires missing coloring-color-reference ${ownerItemId ?? '(unset)'}`
        );
      dependencies.push(owner);
    }
    return { primary, dependencies };
  });
}

function compareMeasuredItems(left: MeasuredItem, right: MeasuredItem): number {
  const kind = compareCodePoints(left.item.kind, right.item.kind);
  if (kind !== 0) return kind;
  const itemId = compareCodePoints(left.item.itemId, right.item.itemId);
  if (itemId !== 0) return itemId;
  const leftRole = left.item.assets[0]?.role ?? '';
  const rightRole = right.item.assets[0]?.role ?? '';
  if (leftRole !== rightRole) return compareCodePoints(leftRole, rightRole);
  const leftPosition = left.item.kind === 'asset' ? left.item.metadata.position : -1;
  const rightPosition = right.item.kind === 'asset' ? right.item.metadata.position : -1;
  return leftPosition - rightPosition;
}

function compareCodePoints(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as object)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export async function prepareArchivePlan(
  items: readonly ArchiveSourceItemV3[],
  options: ArchivePackOptions
): Promise<ArchivePlanV3> {
  if ((options.warnings?.length ?? 0) > MAX_ARCHIVE_TOP_LEVEL_RECORDS)
    throw new Error('Archive manifest contains too many warnings');
  validateLimits(
    options.targetBytes ?? DEFAULT_ARCHIVE_TARGET_BYTES,
    options.hardLimitBytes ?? DEFAULT_ARCHIVE_HARD_LIMIT_BYTES,
    options.maxEntries ?? ZIP_MAX_ENTRIES
  );
  const detachedOptions: ArchivePackOptions = {
    ...options,
    warnings: detachCanonical(options.warnings ?? []),
  };
  const measured: MeasuredItem[] = [];
  for (const sourceItem of items) {
    const assets: MeasuredAsset[] = [];
    for (const source of sourceItem.assets) assets.push(await measure(source, options.signal));
    const detachedItem = detachCanonical({
      itemId: sourceItem.itemId,
      kind: sourceItem.kind,
      parent: sourceItem.parent,
      metadata: sourceItem.metadata,
    });
    const itemWithoutDigest = {
      ...detachedItem,
      assets: assets.map(a => a.descriptor),
    } as ArchiveItemWithoutDigestV3;
    const item = {
      ...itemWithoutDigest,
      digest: calculateItemDigest(itemWithoutDigest),
    } as ArchiveItemV3;
    const canonicalByteLength = utf8Length(canonicalJson(item));
    options.onPartitionItemSerialized?.(item.itemId);
    measured.push({ item, assets, canonicalByteLength });
  }
  return freezePlan(buildPackingAtoms(measured), detachedOptions);
}

function detachCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

async function readAndVerify(asset: MeasuredAsset, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const reader = (await asset.source.open(signal)).getReader(),
    hash = new Hash();
  const chunks: Uint8Array[] = [];
  let length = 0,
    crc = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ARCHIVE_ENTRY_BYTES)
        throw new Error(`Asset ${asset.source.assetId} is too large`);
      hash.update(value);
      crc = crc32Update(crc, value);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const digest = bytesToHex(hash.digest());
  if (
    length !== asset.descriptor.byteLength ||
    digest !== asset.descriptor.digest ||
    crc !== asset.crc32
  )
    throw new Error('Source data changed during export. Start the export again.');
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function buildArchivePart(
  plan: ArchivePlanV3,
  partIndex: number,
  signal?: AbortSignal
): Promise<BuiltArchivePart> {
  const part = plan.parts[partIndex];
  if (!part) throw new Error(`Archive part index ${partIndex} is out of range`);
  signal?.throwIfAborted();
  const zip = new JSZip();
  zip.file(MANIFEST_PATH, canonicalJson(part.manifest), {
    compression: 'STORE',
    createFolders: false,
    date: deterministicZipDate(),
  });
  for (const asset of part.assets)
    zip.file(asset.descriptor.path, await readAndVerify(asset, signal), {
      compression: 'STORE',
      createFolders: false,
      date: deterministicZipDate(),
    });
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
    platform: 'DOS',
  });
  signal?.throwIfAborted();
  if (bytes.byteLength !== part.exactByteLength)
    throw new Error(
      `Internal ZIP size mismatch for part ${part.manifest.partNumber}: planned ${part.exactByteLength}, generated ${bytes.byteLength}`
    );
  if (bytes.byteLength > plan.hardLimitBytes)
    throw new Error(
      `Archive part ${part.manifest.partNumber} exceeds the ${plan.hardLimitBytes}-byte hard limit`
    );
  return { manifest: part.manifest, filename: part.filename, bytes };
}

export async function* buildArchiveParts(
  plan: ArchivePlanV3,
  signal?: AbortSignal
): AsyncGenerator<BuiltArchivePart> {
  for (let partIndex = 0; partIndex < plan.parts.length; partIndex += 1) {
    yield await buildArchivePart(plan, partIndex, signal);
  }
}
