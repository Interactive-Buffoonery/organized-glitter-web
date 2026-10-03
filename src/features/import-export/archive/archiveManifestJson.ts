export const INVALID_ARCHIVE_SCHEMA_ERROR = 'Unsupported or invalid archive schema version';

export function parseArchiveManifestJson(text: string): Record<string, unknown> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Error('Invalid archive manifest JSON');
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error(INVALID_ARCHIVE_SCHEMA_ERROR);
  }
  return manifest as Record<string, unknown>;
}

export function getArchiveSchemaVersion(value: unknown): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error(INVALID_ARCHIVE_SCHEMA_ERROR);
}
