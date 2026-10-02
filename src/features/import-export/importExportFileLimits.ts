// Shared compressed-archive ceiling for export and import, independent of the 50MB
// per-image upload cap. Export omits photos that would exceed it so the ZIP stays
// restorable. Import rejects larger files before JSZip.loadAsync.
export const IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES = 512 * 1024 * 1024;
const IMPORT_EXPORT_ARCHIVE_MAX_SIZE_MB = IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES / (1024 * 1024);

export function assertImportExportZipWithinSizeLimit(file: File): void {
  if (file.size > IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES) {
    throw new Error(`ZIP file exceeds the ${IMPORT_EXPORT_ARCHIVE_MAX_SIZE_MB}MB import limit`);
  }
}
