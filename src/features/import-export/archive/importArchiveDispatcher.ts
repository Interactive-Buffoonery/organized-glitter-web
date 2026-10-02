import {
  readBoundedText,
  MAX_ARCHIVE_MANIFEST_BYTES,
} from '@/features/import-export/archive/archiveZipRead';
import JSZip from 'jszip';
import {
  assertArchiveCentralDirectoryLimits,
  assertArchiveZipMetadataLimits,
} from '@/features/import-export/archive/archiveImportLimits';
import { assertImportExportZipWithinSizeLimit } from '@/features/import-export/importExportFileLimits';
import { getCurrentUser, isAuthenticated } from '@/services/auth';

import {
  importOrganizedGlitterArchive,
  withArchiveImportLock,
} from '@/features/import-export/archive/importArchive';
import { ArchiveRestoreV3Service } from '@/services/pocketbase/archiveRestoreV3.service';
import type { ArchiveImportResult } from '@/features/import-export/archive/types';
import {
  getArchiveSchemaVersion,
  INVALID_ARCHIVE_SCHEMA_ERROR,
  parseArchiveManifestJson,
} from '@/features/import-export/archive/archiveManifestJson';

export type DispatchedArchiveImportResult =
  | { schemaVersion: 1 | 2; result: ArchiveImportResult }
  | {
      schemaVersion: 3;
      result: Awaited<
        ReturnType<typeof import('@/features/import-export/archive/v3/import').importArchiveV3Parts>
      >;
    };

async function readSchemaVersion(file: File): Promise<1 | 2 | 3> {
  assertImportExportZipWithinSizeLimit(file);
  await assertArchiveCentralDirectoryLimits(file);
  const zip = await JSZip.loadAsync(file);
  assertArchiveZipMetadataLimits(zip);
  const entry = zip.file('manifest.json');
  if (!entry) throw new Error('Archive is missing manifest.json');
  const manifest = parseArchiveManifestJson(
    await readBoundedText(entry, MAX_ARCHIVE_MANIFEST_BYTES)
  );
  return getArchiveSchemaVersion(manifest.schemaVersion);
}

export async function importOrganizedGlitterArchives(
  files: readonly File[],
  options: {
    signal?: AbortSignal;
    onV3Progress?: Parameters<
      typeof import('@/features/import-export/archive/v3/import').importArchiveV3Parts
    >[1]['onProgress'];
  } = {}
): Promise<DispatchedArchiveImportResult> {
  if (!isAuthenticated()) throw new Error('You must be logged in to import an archive');
  const user = getCurrentUser();
  if (!user?.id) throw new Error('You must be logged in to import an archive');
  if (files.length === 0) throw new Error('Select at least one archive file');

  if (files.length === 1) {
    const schemaVersion = await readSchemaVersion(files[0]);
    if (schemaVersion === 1 || schemaVersion === 2) {
      return {
        schemaVersion,
        result: await importOrganizedGlitterArchive(files[0]),
      };
    }
    if (schemaVersion !== 3) throw new Error(INVALID_ARCHIVE_SCHEMA_ERROR);
  }

  const capabilities = await ArchiveRestoreV3Service.getCapabilities(options.signal);
  const { importArchiveV3Parts } = await import('@/features/import-export/archive/v3/import');
  return withArchiveImportLock(`organized-glitter:archive-import:${user.id}`, async () => ({
    schemaVersion: 3 as const,
    result: await importArchiveV3Parts(files, {
      capabilities,
      adapter: ArchiveRestoreV3Service,
      session: {
        userId: user.id,
        signal: options.signal,
        getCurrentUserId: () => getCurrentUser()?.id ?? null,
      },
      onProgress: options.onV3Progress,
    }),
  }));
}
