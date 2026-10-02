import Papa from 'papaparse';

import type {
  BulkPhotoFileInput,
  BulkPhotoManifestEntry,
  BulkPhotoTargetType,
} from '@/features/import-export/bulk-photos/types';
import {
  parsePhotoTargetRef,
  targetTypesByKind,
} from '@/features/import-export/bulk-photos/targetKinds';
import { parseDateOnlyAsLocalDate } from '@/utils/date/timezoneUtils';

const TARGET_TYPES: Set<string> = new Set(Object.values(targetTypesByKind).flat());

function invalidField(manifestName: string, index: number, field: string): never {
  throw new Error(`${manifestName} file entry ${index + 1} has an invalid ${field}`);
}

function validatePhotoImportManifestEntry(
  entry: unknown,
  manifestName: 'photo-import.json' | 'photo-import.csv',
  index: number
): BulkPhotoManifestEntry {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${manifestName} file entry ${index + 1} must be an object`);
  }

  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.path !== 'string' || candidate.path.trim() === '') {
    invalidField(manifestName, index, 'file path');
  }

  if (
    candidate.targetType !== undefined &&
    (typeof candidate.targetType !== 'string' || !TARGET_TYPES.has(candidate.targetType))
  ) {
    invalidField(manifestName, index, 'targetType');
  }

  if (
    candidate.targetRef !== undefined &&
    (typeof candidate.targetRef !== 'string' || !parsePhotoTargetRef(candidate.targetRef))
  ) {
    invalidField(manifestName, index, 'targetRef');
  }

  if (candidate.title !== undefined && typeof candidate.title !== 'string') {
    invalidField(manifestName, index, 'title');
  }

  if (
    candidate.date !== undefined &&
    (typeof candidate.date !== 'string' ||
      (candidate.date !== '' && !parseDateOnlyAsLocalDate(candidate.date)))
  ) {
    invalidField(manifestName, index, 'date');
  }

  if (candidate.note !== undefined && typeof candidate.note !== 'string') {
    invalidField(manifestName, index, 'note');
  }

  const pageNumber =
    typeof candidate.pageNumber === 'number' &&
    Number.isInteger(candidate.pageNumber) &&
    candidate.pageNumber >= 1
      ? candidate.pageNumber
      : undefined;

  return {
    path: candidate.path,
    ...(candidate.targetType !== undefined && {
      targetType: candidate.targetType as BulkPhotoTargetType,
    }),
    ...(candidate.targetRef !== undefined && { targetRef: candidate.targetRef }),
    ...(candidate.title !== undefined && { title: candidate.title }),
    pageNumber,
    ...(candidate.date !== undefined && { date: candidate.date }),
    ...(candidate.note !== undefined && { note: candidate.note }),
  };
}

function csvCell(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function csvPath(row: Record<string, string>): string | undefined {
  return csvCell(row.path) ?? csvCell(row.filename) ?? csvCell(row.file);
}

function csvPageNumber(value: string | undefined): number | undefined {
  const trimmed = csvCell(value);
  return trimmed === undefined ? undefined : Number(trimmed);
}

export function parsePhotoImportJson(content: string): BulkPhotoManifestEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error('photo-import.json contains invalid JSON');
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).files
      : undefined;
  if (!Array.isArray(entries)) {
    throw new Error('photo-import.json must contain a files array');
  }
  return validateUniqueManifestPaths(
    entries.map((entry, index) =>
      validatePhotoImportManifestEntry(entry, 'photo-import.json', index)
    ),
    'photo-import.json'
  );
}

export function parsePhotoImportCsv(content: string): BulkPhotoManifestEntry[] {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: header => header.trim(),
  });

  const parseError = parsed.errors.find(
    error => error.code !== 'UndetectableDelimiter' && error.code !== 'TooFewFields'
  );
  if (parseError) {
    const { row, message, type } = parseError;
    // Papa counts the header for quote errors but excludes it for field mismatches.
    const rowLabel = row === undefined ? 'unknown' : String(row + (type === 'Quotes' ? 1 : 2));
    throw new Error(`photo-import.csv row ${rowLabel} is malformed: ${message}`);
  }

  return validateUniqueManifestPaths(
    parsed.data.map((row, index) =>
      validatePhotoImportManifestEntry(
        {
          path: csvPath(row),
          targetType: csvCell(row.targetType),
          targetRef: csvCell(row.targetRef) ?? csvCell(row.id),
          title: csvCell(row.title),
          pageNumber: csvPageNumber(row.pageNumber),
          date: csvCell(row.date),
          note: csvCell(row.note),
        },
        'photo-import.csv',
        index
      )
    ),
    'photo-import.csv'
  );
}

function normalizeManifestPath(path: string): string {
  return path
    .trim()
    .replace(/[\\/]+/g, '/')
    .toLowerCase();
}

export function validateUniqueManifestPaths(
  entries: BulkPhotoManifestEntry[],
  manifestName = 'photo import manifest'
): BulkPhotoManifestEntry[] {
  const seen = new Map<string, number>();
  entries.forEach((entry, index) => {
    const normalizedPath = normalizeManifestPath(entry.path);
    const previousIndex = seen.get(normalizedPath);
    if (previousIndex !== undefined) {
      throw new Error(
        `${manifestName} file entry ${index + 1} duplicates the path in entry ${previousIndex + 1}`
      );
    }
    seen.set(normalizedPath, index);
  });
  return entries;
}

function basenameOf(normalizedPath: string): string {
  return normalizedPath.split('/').pop() ?? normalizedPath;
}

export function manifestPathBasename(path: string): string {
  return basenameOf(normalizeManifestPath(path));
}

export function findManifestForPath(
  manifests: BulkPhotoManifestEntry[],
  path: string,
  ambiguousBasenames: Set<string> = new Set()
): BulkPhotoManifestEntry | undefined {
  const normalizedPath = normalizeManifestPath(path);

  const exactMatch = manifests.find(entry => normalizeManifestPath(entry.path) === normalizedPath);
  if (exactMatch) {
    return exactMatch;
  }

  const basename = basenameOf(normalizedPath);
  if (ambiguousBasenames.has(basename)) {
    return undefined;
  }

  const basenameMatches = manifests.filter(entry => {
    const normalizedEntryPath = normalizeManifestPath(entry.path);
    return !normalizedEntryPath.includes('/') && normalizedEntryPath === basename;
  });
  return basenameMatches.length === 1 ? basenameMatches[0] : undefined;
}

export function toBulkPhotoFileInputs(files: FileList | File[]): BulkPhotoFileInput[] {
  return Array.from(files).map(file => ({
    file,
    path: file.webkitRelativePath || file.name,
  }));
}
