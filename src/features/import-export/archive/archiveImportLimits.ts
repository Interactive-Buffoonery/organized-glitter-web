import type JSZip from 'jszip';

import { MAX_ARCHIVE_MANIFEST_BYTES } from '@/features/import-export/archive/archiveZipRead';

export const MAX_ARCHIVE_ENTRIES = 10_000;
export const MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_ARCHIVE_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ARCHIVE_COMPRESSION_RATIO = 1_000;
export const MAX_ARCHIVE_TOP_LEVEL_RECORDS = 10_000;
export const MAX_ARCHIVE_PAGES = 100_000;
export const MAX_ARCHIVE_PAGE_PHOTOS = 99;
export const MAX_ARCHIVE_NESTED_RECORDS = 10_000;
export const MAX_ARCHIVE_TOTAL_RECORDS = 100_000;

type CompressedEntry = JSZip.JSZipObject & {
  _data?: { compressedSize?: number; uncompressedSize?: number };
};

/** Validate one entry without reading or expanding its contents. */
function assertArchiveEntrySizeLimits(
  compressedSize: number | undefined,
  uncompressedSize: number | undefined,
  isManifest: boolean,
  entryLabel = 'Archive entry'
): number {
  if (
    typeof compressedSize !== 'number' ||
    typeof uncompressedSize !== 'number' ||
    !Number.isSafeInteger(compressedSize) ||
    !Number.isSafeInteger(uncompressedSize) ||
    compressedSize < 0 ||
    uncompressedSize < 0
  ) {
    throw new Error(`${entryLabel} has invalid size metadata`);
  }
  const entryLimit = isManifest ? MAX_ARCHIVE_MANIFEST_BYTES : MAX_ARCHIVE_ENTRY_BYTES;
  if (uncompressedSize > entryLimit) throw new Error(`${entryLabel} is too large`);
  if (
    !isManifest &&
    uncompressedSize > 0 &&
    uncompressedSize / Math.max(compressedSize, 1) > MAX_ARCHIVE_COMPRESSION_RATIO
  ) {
    throw new Error(`${entryLabel} exceeds the compression ratio limit`);
  }
  return uncompressedSize;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;

function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function readFileRange(file: File, start: number, end?: number): Promise<ArrayBuffer> {
  return readBlobBytes(file.slice(start, end));
}

export async function assertArchiveCentralDirectoryLimits(
  file: File,
  isAdditionalManifest?: (name: string) => boolean
): Promise<void> {
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = new DataView(await readFileRange(file, tailStart));
  let endOffset = -1;
  for (let offset = tail.byteLength - 4; offset >= 0; offset--) {
    if (tail.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      endOffset = offset;
      break;
    }
  }
  if (
    endOffset < 0 ||
    endOffset + 22 > tail.byteLength ||
    endOffset + 22 + tail.getUint16(endOffset + 20, true) !== tail.byteLength
  ) {
    throw new Error('Archive has an invalid central directory');
  }

  const declaredCount = tail.getUint16(endOffset + 10, true);
  const directoryBytes = tail.getUint32(endOffset + 12, true);
  const directoryOffset = tail.getUint32(endOffset + 16, true);
  if (
    tail.getUint16(endOffset + 4, true) !== 0 ||
    tail.getUint16(endOffset + 6, true) !== 0 ||
    tail.getUint16(endOffset + 8, true) !== declaredCount ||
    declaredCount === 0xffff ||
    directoryBytes === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    throw new Error('Archive uses unsupported ZIP directory metadata');
  }
  if (declaredCount > MAX_ARCHIVE_ENTRIES) throw new Error('Archive contains too many entries');
  if (directoryBytes > MAX_ARCHIVE_CENTRAL_DIRECTORY_BYTES) {
    throw new Error('Archive central directory is too large');
  }
  if (directoryOffset + directoryBytes !== tailStart + endOffset) {
    throw new Error('Archive has an invalid central directory');
  }

  const directory = new DataView(
    await readFileRange(file, directoryOffset, directoryOffset + directoryBytes)
  );
  let position = 0;
  let observedCount = 0;
  let expandedBytes = 0;
  const manifestName = new TextEncoder().encode('manifest.json');
  const nameDecoder = new TextDecoder();
  while (position < directory.byteLength) {
    if (
      position + 46 > directory.byteLength ||
      directory.getUint32(position, true) !== CENTRAL_DIRECTORY_ENTRY
    ) {
      throw new Error('Archive has an invalid central directory');
    }
    const compressedSize = directory.getUint32(position + 20, true);
    const uncompressedSize = directory.getUint32(position + 24, true);
    const nameLength = directory.getUint16(position + 28, true);
    const extraLength = directory.getUint16(position + 30, true);
    const commentLength = directory.getUint16(position + 32, true);
    const nextPosition = position + 46 + nameLength + extraLength + commentLength;
    if (
      nextPosition > directory.byteLength ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff
    ) {
      throw new Error('Archive has unsupported entry metadata');
    }
    observedCount += 1;
    if (observedCount > MAX_ARCHIVE_ENTRIES) throw new Error('Archive contains too many entries');
    const isArchiveManifest =
      nameLength === manifestName.length &&
      manifestName.every((byte, index) => directory.getUint8(position + 46 + index) === byte);
    const isManifest =
      isArchiveManifest ||
      Boolean(
        isAdditionalManifest?.(
          nameDecoder.decode(
            new Uint8Array(directory.buffer, directory.byteOffset + position + 46, nameLength)
          )
        )
      );
    expandedBytes += assertArchiveEntrySizeLimits(compressedSize, uncompressedSize, isManifest);
    if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
      throw new Error('Archive expanded data is too large');
    }
    position = nextPosition;
  }
  if (observedCount !== declaredCount) {
    throw new Error('Archive central directory count does not match its entries');
  }
}

export function assertArchiveZipMetadataLimits(
  zip: JSZip,
  isAdditionalManifest?: (name: string) => boolean
): void {
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Archive contains too many entries');
  }

  let expandedBytes = 0;
  for (const entry of entries as CompressedEntry[]) {
    if (entry.dir) continue;
    const { compressedSize, uncompressedSize } = entry._data ?? {};
    const isManifest =
      entry.name === 'manifest.json' || Boolean(isAdditionalManifest?.(entry.name));
    expandedBytes += assertArchiveEntrySizeLimits(
      compressedSize,
      uncompressedSize,
      isManifest,
      `Archive entry ${entry.name}`
    );
    if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
      throw new Error('Archive expanded data is too large');
    }
  }
}

export function assertArchiveManifestRecordLimits(manifest: {
  files?: unknown;
  diamondProjects?: unknown;
  coloringMediums?: unknown;
  coloringBooks?: unknown;
  warnings?: unknown;
}): void {
  const limits = [
    ['files', manifest.files],
    ['diamond projects', manifest.diamondProjects],
    ['coloring mediums', manifest.coloringMediums],
    ['coloring books', manifest.coloringBooks],
    ['warnings', manifest.warnings],
  ] as const;
  for (const [name, records] of limits) {
    if (Array.isArray(records) && records.length > MAX_ARCHIVE_TOP_LEVEL_RECORDS) {
      throw new Error(`Archive manifest contains too many ${name}`);
    }
  }

  let nestedRecordCount = 0;
  let pageCount = 0;
  const addNested = (value: unknown, name: string) => {
    if (!Array.isArray(value)) return;
    nestedRecordCount += value.length;
    if (nestedRecordCount > MAX_ARCHIVE_NESTED_RECORDS) {
      throw new Error(`Archive manifest contains too many ${name}`);
    }
  };
  for (const project of Array.isArray(manifest.diamondProjects) ? manifest.diamondProjects : []) {
    if (!project || typeof project !== 'object') continue;
    if ('progressNotes' in project) addNested(project.progressNotes, 'progress notes');
    if ('tags' in project) addNested(project.tags, 'tags');
  }
  for (const book of Array.isArray(manifest.coloringBooks) ? manifest.coloringBooks : []) {
    if (!book || typeof book !== 'object') continue;
    if ('tags' in book) addNested(book.tags, 'tags');
    if (!('pages' in book) || !Array.isArray(book.pages)) continue;
    pageCount += book.pages.length;
    if (pageCount > MAX_ARCHIVE_PAGES) {
      throw new Error('Archive manifest contains too many coloring pages');
    }
    for (const page of book.pages) {
      if (!page || typeof page !== 'object') continue;
      if ('photoPaths' in page && Array.isArray(page.photoPaths)) {
        if (page.photoPaths.length > MAX_ARCHIVE_PAGE_PHOTOS) {
          throw new Error('Archive coloring page exceeds the 99 photos limit');
        }
        addNested(page.photoPaths, 'photo paths');
      }
      if ('progressNotes' in page) addNested(page.progressNotes, 'progress notes');
      if ('mediumRefs' in page) addNested(page.mediumRefs, 'medium references');
      if (
        'colorReference' in page &&
        page.colorReference &&
        typeof page.colorReference === 'object' &&
        'photoPaths' in page.colorReference
      ) {
        addNested(page.colorReference.photoPaths, 'swatch photo paths');
      }
    }
  }
  const topLevelRecords =
    (Array.isArray(manifest.diamondProjects) ? manifest.diamondProjects.length : 0) +
    (Array.isArray(manifest.coloringBooks) ? manifest.coloringBooks.length : 0) +
    (Array.isArray(manifest.coloringMediums) ? manifest.coloringMediums.length : 0);
  if (topLevelRecords + pageCount + nestedRecordCount > MAX_ARCHIVE_TOTAL_RECORDS) {
    throw new Error('Archive manifest contains too many records');
  }
}

export function assertArchiveV3RecordLimits(
  manifest: { items?: unknown; warnings?: unknown },
  maxMetadataListEntries = 1_000
): void {
  if (Array.isArray(manifest.items) && manifest.items.length > MAX_ARCHIVE_TOP_LEVEL_RECORDS) {
    throw new Error('Archive manifest contains too many items');
  }
  if (
    Array.isArray(manifest.warnings) &&
    manifest.warnings.length > MAX_ARCHIVE_TOP_LEVEL_RECORDS
  ) {
    throw new Error('Archive manifest contains too many warnings');
  }
  for (const item of Array.isArray(manifest.items) ? manifest.items : []) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (Array.isArray(raw.assets) && raw.assets.length > 1) {
      throw new Error('Archive item declares too many assets');
    }
    let descriptor: unknown = raw;
    for (let depth = 0; depth < 4 && descriptor && typeof descriptor === 'object'; depth++) {
      const value = descriptor as Record<string, unknown>;
      if (!value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata)) {
        throw new Error('Archive item has an invalid metadata shape');
      }
      const metadata = value.metadata as Record<string, unknown>;
      let fieldCount = 0;
      for (const name in metadata) {
        if (!Object.hasOwn(metadata, name)) continue;
        fieldCount += 1;
        if (fieldCount > 64) throw new Error('Archive metadata has too many fields');
        const list = metadata[name];
        if (Array.isArray(list) && list.length > maxMetadataListEntries) {
          throw new Error(`Archive metadata contains too many ${name}`);
        }
      }
      descriptor = value.parent;
    }
  }
}
