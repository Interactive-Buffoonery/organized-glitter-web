import JSZip from 'jszip';
import {
  assertArchiveCentralDirectoryLimits,
  assertArchiveV3RecordLimits,
  assertArchiveZipMetadataLimits,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_EXPANDED_BYTES,
} from '@/features/import-export/archive/archiveImportLimits';
import { Hash } from 'fast-sha256';

import { assertImportExportZipWithinSizeLimit } from '@/features/import-export/importExportFileLimits';
import {
  INVALID_ARCHIVE_SCHEMA_ERROR,
  parseArchiveManifestJson,
} from '@/features/import-export/archive/archiveManifestJson';

import { bytesToHex } from '@/features/import-export/archive/v3/canonical';
import {
  entryStream,
  readBoundedBlob,
  readBoundedText,
  MAX_ARCHIVE_MANIFEST_BYTES,
} from '@/features/import-export/archive/archiveZipRead';
import type {
  ArchiveItemV3,
  ArchivePartManifestV3,
} from '@/features/import-export/archive/v3/types';
import { validateArchiveManifestV3 } from '@/features/import-export/archive/v3/validate';
import type {
  ArchiveRestoreCapabilities,
  RestoreArchiveItemResponse,
} from '@/services/pocketbase/archiveRestoreV3.service';

const MANIFEST_PATH = 'manifest.json';
const MAX_PART_COUNT = 10_000;
const SERVER_ID = /^[a-z0-9][a-z0-9:._-]{0,254}$/;

export interface ArchiveV3ImportSession {
  userId: string;
  signal?: AbortSignal;
  getCurrentUserId(): string | null;
}

export interface ArchiveV3ImportAdapter {
  restoreItem(input: {
    request: {
      backupId: string;
      partNumber: number;
      partCount: number;
      inventoryDigest: string;
      item: ArchiveItemV3;
    };
    assets: ReadonlyMap<string, Blob>;
    signal?: AbortSignal;
  }): Promise<RestoreArchiveItemResponse>;
}

export interface ArchiveV3ImportProgress {
  phase: 'preflight' | 'restore';
  completed: number;
  total: number;
  partNumber?: number;
  itemId?: string;
}

export interface ArchiveV3ItemResult extends RestoreArchiveItemResponse {
  partNumber: number;
}

export interface ArchiveV3ItemFailure {
  partNumber: number;
  itemId: string;
  kind: 'conflict' | 'failed' | 'cancelled';
  message: string;
}

export interface ArchiveV3ImportResult {
  success: boolean;
  backupId: string;
  selectedPartNumbers: number[];
  missingPartNumbers: number[];
  selectedPartCount: number;
  totalPartCount: number;
  selectedLogicalItemCount: number;
  createdItemCount: number;
  createdLibraryItemCount: number;
  scaffoldedItemCount: number;
  alreadyAppliedItemCount: number;
  restoredAssetCount: number;
  alreadyAppliedAssetCount: number;
  conflicts: ArchiveV3ItemFailure[];
  errors: ArchiveV3ItemFailure[];
  itemResults: ArchiveV3ItemResult[];
}

interface PreparedPart {
  file: File;
  manifest: ArchivePartManifestV3;
}

function digestEntry(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  budget: { expandedBytes: number }
): Promise<{ byteLength: number; digest: string }> {
  return new Promise((resolve, reject) => {
    const hash = new Hash();
    let byteLength = 0;
    const stream = entryStream(entry);
    stream.on('data', (chunk: Uint8Array) => {
      byteLength += chunk.byteLength;
      budget.expandedBytes += chunk.byteLength;
      if (byteLength > maxBytes || budget.expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
        stream.pause();
        reject(
          new Error(
            byteLength > maxBytes
              ? `Archive asset ${entry.name} exceeds the server upload limit`
              : 'Archive expanded data is too large'
          )
        );
        return;
      }
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve({ byteLength, digest: bytesToHex(hash.digest()) }));
    stream.resume();
  });
}

function assertSession(session: ArchiveV3ImportSession): void {
  if (session.signal?.aborted)
    throw new DOMException('Archive restore was cancelled', 'AbortError');
  if (session.getCurrentUserId() !== session.userId) {
    throw new Error('The signed-in account changed during archive restore. Restore was stopped.');
  }
}

function sessionChanged(session: ArchiveV3ImportSession): boolean {
  return session.getCurrentUserId() !== session.userId;
}

function sessionStopMessage(session: ArchiveV3ImportSession): string | null {
  if (session.signal?.aborted) return 'Archive restore was cancelled';
  if (sessionChanged(session))
    return 'The signed-in account changed during archive restore. Restore was stopped.';
  return null;
}

function report(
  callback: ((progress: ArchiveV3ImportProgress) => void) | undefined,
  progress: ArchiveV3ImportProgress
): void {
  if (!callback) return;
  try {
    callback(progress);
  } catch {
    // Progress observers cannot change restore correctness.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Archive item restore failed';
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    status?: number;
    response?: { data?: { reason?: string }; reason?: string };
  };
  const reason = candidate.response?.data?.reason ?? candidate.response?.reason;
  return candidate.status === 409 || reason?.includes('conflict') === true;
}

function stopsRestore(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { status?: unknown }).status;
  return (
    status === 0 ||
    status === 401 ||
    status === 403 ||
    error instanceof TypeError ||
    (error instanceof Error && error.name === 'NetworkError')
  );
}

function assertServerMetadataLimits(
  item: ArchiveItemV3,
  capabilities: ArchiveRestoreCapabilities
): void {
  const check = (metadata: Record<string, unknown>, label: string) => {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' && value.length > capabilities.maxMetadataStringChars)
        throw new Error(`${label} ${key} exceeds the server text limit`);
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) || value < 0 || value > capabilities.maxMetadataNumber)
      )
        throw new Error(`${label} ${key} exceeds the server number limit`);
      if (
        Array.isArray(value) &&
        (value.length > capabilities.maxMetadataListEntries ||
          value.some(
            entry =>
              typeof entry !== 'string' || entry.length > capabilities.maxMetadataListEntryChars
          ))
      )
        throw new Error(`${label} ${key} exceeds the server list limit`);
    }
  };
  check(item.metadata as unknown as Record<string, unknown>, item.itemId);
  if (!SERVER_ID.test(item.itemId) || item.assets.some(asset => !SERVER_ID.test(asset.assetId)))
    throw new Error(`Archive item ${item.itemId} has an invalid server ID`);
  if (item.kind === 'asset' && item.metadata.position > capabilities.maxAssetPosition)
    throw new Error(`${item.itemId} exceeds the server asset position limit`);
  let parent = item.parent;
  while (parent) {
    if (!SERVER_ID.test(parent.itemId))
      throw new Error(`Archive parent ${parent.itemId} has an invalid server ID`);
    check(parent.metadata as unknown as Record<string, unknown>, parent.itemId);
    parent = parent.parent;
  }
}

async function inspectPart(
  file: File,
  capabilities: ArchiveRestoreCapabilities
): Promise<PreparedPart> {
  assertImportExportZipWithinSizeLimit(file);
  if (file.size > capabilities.maxPartBytes) {
    throw new Error(`Archive part ${file.name} exceeds the server's multipart restore limit`);
  }
  await assertArchiveCentralDirectoryLimits(file);
  const zip = await JSZip.loadAsync(file);
  assertArchiveZipMetadataLimits(zip);
  if (
    Object.values(zip.files).some(
      entry => entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name
    )
  )
    throw new Error(`${file.name} contains an unsafe ZIP path`);
  const manifestEntry = zip.file(MANIFEST_PATH);
  if (!manifestEntry) throw new Error(`${file.name} is missing manifest.json`);
  if (
    ((manifestEntry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize ?? 0) > MAX_ARCHIVE_MANIFEST_BYTES
  )
    throw new Error(`${file.name} manifest is too large`);
  const manifestJson = await readBoundedText(manifestEntry, MAX_ARCHIVE_MANIFEST_BYTES);
  const rawManifest = parseArchiveManifestJson(manifestJson);
  if (rawManifest.schemaVersion !== 3) throw new Error(INVALID_ARCHIVE_SCHEMA_ERROR);
  assertArchiveV3RecordLimits(rawManifest, capabilities.maxMetadataListEntries);

  const paths = new Set(Object.keys(zip.files).filter(path => !zip.files[path].dir));
  const manifest = validateArchiveManifestV3(rawManifest, { paths });
  if (manifest.partCount > MAX_PART_COUNT) throw new Error('Archive declares too many parts');
  for (const item of manifest.items) {
    assertServerMetadataLimits(item, capabilities);
    const request = {
      backupId: manifest.backupId,
      partNumber: manifest.partNumber,
      partCount: manifest.partCount,
      inventoryDigest: manifest.inventoryDigest,
      item,
    };
    if (JSON.stringify(request).length > capabilities.maxRestoreRequestChars)
      throw new Error(`Archive item ${item.itemId} exceeds the server request limit`);
  }
  const actualEntries = new Map<string, { byteLength: number; digest: string }>();
  const extractionBudget = { expandedBytes: new TextEncoder().encode(manifestJson).byteLength };
  for (const item of manifest.items) {
    for (const descriptor of item.assets) {
      const entry = zip.file(descriptor.path);
      if (!entry) throw new Error(`Missing declared file: ${descriptor.path}`);
      const roleLimit = capabilities.maxAssetBytesByRole[descriptor.role];
      if (!Number.isSafeInteger(roleLimit) || descriptor.byteLength > roleLimit)
        throw new Error(`Archive asset ${descriptor.path} exceeds the server upload limit`);
      if (
        ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ??
          0) > roleLimit
      )
        throw new Error(`Archive asset ${descriptor.path} exceeds the server upload limit`);
      const actualEntry = await digestEntry(entry, roleLimit, extractionBudget);
      actualEntries.set(descriptor.path, actualEntry);
    }
  }
  validateArchiveManifestV3(rawManifest, { paths, entries: actualEntries });
  return { file, manifest };
}

function assertSelectedSet(parts: PreparedPart[]): void {
  const first = parts[0].manifest;
  const partNumbers = new Map<number, string>();
  const logicalItems = new Map<string, { digest: string; kind: string }>();
  for (const { manifest } of parts) {
    if (
      manifest.backupId !== first.backupId ||
      manifest.partCount !== first.partCount ||
      manifest.exportedAt !== first.exportedAt ||
      manifest.appVersion !== first.appVersion
    ) {
      throw new Error('Selected archive parts do not belong to the same backup set');
    }
    const selectedDigest = partNumbers.get(manifest.partNumber);
    if (selectedDigest) {
      throw new Error(
        selectedDigest === manifest.inventoryDigest
          ? `Archive part ${manifest.partNumber} was selected more than once`
          : `Archive part ${manifest.partNumber} has conflicting inventories`
      );
    }
    partNumbers.set(manifest.partNumber, manifest.inventoryDigest);
    for (const item of manifest.items) {
      const prior = logicalItems.get(item.itemId);
      if (prior && (prior.digest !== item.digest || prior.kind !== item.kind)) {
        throw new Error(`Archive item ${item.itemId} conflicts across selected parts`);
      }
      logicalItems.set(item.itemId, { digest: item.digest, kind: item.kind });
    }
  }
}

async function preflightArchiveV3Parts(
  files: readonly File[],
  capabilities: ArchiveRestoreCapabilities,
  options: {
    session?: ArchiveV3ImportSession;
    onProgress?: (progress: ArchiveV3ImportProgress) => void;
  } = {}
): Promise<PreparedPart[]> {
  if (files.length === 0) throw new Error('Select at least one archive part');
  const parts: PreparedPart[] = [];
  for (const file of files) {
    if (options.session) assertSession(options.session);
    parts.push(await inspectPart(file, capabilities));
    report(options.onProgress, {
      phase: 'preflight',
      completed: parts.length,
      total: files.length,
      partNumber: parts.at(-1)?.manifest.partNumber,
    });
  }
  assertSelectedSet(parts);
  return parts.sort((left, right) => left.manifest.partNumber - right.manifest.partNumber);
}

async function loadItemAssets(
  zip: JSZip,
  item: ArchiveItemV3,
  capabilities: ArchiveRestoreCapabilities,
  extractionBudget: { expandedBytes: number }
) {
  const assets = new Map<string, Blob>();
  for (const descriptor of item.assets) {
    const entry = zip.file(descriptor.path);
    if (!entry) throw new Error(`Prepared archive asset is missing: ${descriptor.path}`);
    const roleLimit = capabilities.maxAssetBytesByRole[descriptor.role];
    assets.set(
      descriptor.assetId,
      await readBoundedBlob(
        entry,
        Math.min(MAX_ARCHIVE_ENTRY_BYTES, roleLimit),
        extractionBudget,
        MAX_ARCHIVE_EXPANDED_BYTES
      )
    );
  }
  return assets;
}

export async function importArchiveV3Parts(
  files: readonly File[],
  input: {
    capabilities: ArchiveRestoreCapabilities;
    adapter: ArchiveV3ImportAdapter;
    session: ArchiveV3ImportSession;
    onProgress?: (progress: ArchiveV3ImportProgress) => void;
  }
): Promise<ArchiveV3ImportResult> {
  assertSession(input.session);
  const parts = await preflightArchiveV3Parts(files, input.capabilities, {
    session: input.session,
    onProgress: input.onProgress,
  });
  assertSession(input.session);

  const first = parts[0].manifest;
  const selectedPartNumbers = parts.map(part => part.manifest.partNumber);
  const selectedPartNumberSet = new Set(selectedPartNumbers);
  const missingPartNumbers = Array.from(
    { length: first.partCount },
    (_, index) => index + 1
  ).filter(partNumber => !selectedPartNumberSet.has(partNumber));
  const logicalItemIds = new Set(
    parts.flatMap(part => part.manifest.items.map(item => item.itemId))
  );
  const totalRequests = parts.reduce((count, part) => count + part.manifest.items.length, 0);
  const itemResults: ArchiveV3ItemResult[] = [];
  const conflicts: ArchiveV3ItemFailure[] = [];
  const errors: ArchiveV3ItemFailure[] = [];
  let completed = 0;
  let createdLibraryItemCount = 0;

  function stopPart(
    partNumber: number,
    itemId: string,
    message: string,
    kind: 'cancelled' | 'failed'
  ): ArchiveV3ImportResult {
    errors.push({ partNumber, itemId, kind, message });
    return summarize();
  }

  for (const part of parts) {
    const nextItemId = part.manifest.items[0]?.itemId ?? `part:${part.manifest.partNumber}`;
    const stopMessage = sessionStopMessage(input.session);
    if (stopMessage)
      return stopPart(part.manifest.partNumber, nextItemId, stopMessage, 'cancelled');
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(part.file);
    } catch (error) {
      return stopPart(part.manifest.partNumber, nextItemId, errorMessage(error), 'failed');
    }
    const stopAfterLoad = sessionStopMessage(input.session);
    if (stopAfterLoad)
      return stopPart(part.manifest.partNumber, nextItemId, stopAfterLoad, 'cancelled');
    const extractionBudget = { expandedBytes: 0 };
    for (const item of part.manifest.items) {
      try {
        assertSession(input.session);
        const response = await input.adapter.restoreItem({
          request: {
            backupId: part.manifest.backupId,
            partNumber: part.manifest.partNumber,
            partCount: part.manifest.partCount,
            inventoryDigest: part.manifest.inventoryDigest,
            item,
          },
          assets: await loadItemAssets(zip, item, input.capabilities, extractionBudget),
          signal: input.session.signal,
        });
        itemResults.push({ ...response, partNumber: part.manifest.partNumber });
        if (
          response.outcome === 'created' &&
          (item.kind === 'diamond-project' || item.kind === 'coloring-book')
        ) {
          createdLibraryItemCount += 1;
        }
        assertSession(input.session);
      } catch (error) {
        const failure: ArchiveV3ItemFailure = {
          partNumber: part.manifest.partNumber,
          itemId: item.itemId,
          kind: sessionStopMessage(input.session)
            ? 'cancelled'
            : isConflict(error)
              ? 'conflict'
              : 'failed',
          message: errorMessage(error),
        };
        if (failure.kind === 'conflict') conflicts.push(failure);
        else errors.push(failure);
        if (failure.kind === 'cancelled' || (failure.kind === 'failed' && stopsRestore(error))) {
          return summarize();
        }
      } finally {
        completed += 1;
        report(input.onProgress, {
          phase: 'restore',
          completed,
          total: totalRequests,
          partNumber: part.manifest.partNumber,
          itemId: item.itemId,
        });
      }
    }
  }

  return summarize();

  function summarize(): ArchiveV3ImportResult {
    return {
      success: conflicts.length === 0 && errors.length === 0,
      backupId: first.backupId,
      selectedPartNumbers,
      missingPartNumbers,
      selectedPartCount: parts.length,
      totalPartCount: first.partCount,
      selectedLogicalItemCount: logicalItemIds.size,
      createdItemCount: itemResults.filter(result => result.outcome === 'created').length,
      createdLibraryItemCount,
      scaffoldedItemCount: itemResults.reduce(
        (count, result) => count + (result.scaffoldedParentCount ?? 0),
        0
      ),
      alreadyAppliedItemCount: itemResults.filter(result => result.outcome === 'already_applied')
        .length,
      restoredAssetCount: itemResults
        .flatMap(result => result.assetOutcomes)
        .filter(asset => asset.outcome === 'created').length,
      alreadyAppliedAssetCount: itemResults
        .flatMap(result => result.assetOutcomes)
        .filter(asset => asset.outcome === 'already_applied').length,
      conflicts,
      errors,
      itemResults,
    };
  }
}
