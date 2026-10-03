import { hasSupportedImageExtension, isSupportedImageMime } from '@/utils/image/imagePolicy';
import type {
  BulkPhotoFileInput,
  BulkPhotoLibrary,
  BulkPhotoManifestEntry,
  BulkPhotoReviewRow,
} from '@/features/import-export/bulk-photos/types';
import { matchPhotoFile } from '@/features/import-export/bulk-photos/matchingRules';
import {
  manifestPathBasename,
  validateUniqueManifestPaths,
} from '@/features/import-export/bulk-photos/photoImportManifest';

function isImageFile(file: File): boolean {
  return isSupportedImageMime(file.type) || hasSupportedImageExtension(file.name);
}

function findAmbiguousBasenames(paths: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const basename = manifestPathBasename(path);
    counts.set(basename, (counts.get(basename) ?? 0) + 1);
  }

  const ambiguous = new Set<string>();
  for (const [basename, count] of counts) {
    if (count > 1) {
      ambiguous.add(basename);
    }
  }
  return ambiguous;
}

function targetHasExistingCover(row: BulkPhotoReviewRow, library: BulkPhotoLibrary): boolean {
  if (row.targetType === 'project-cover') {
    return Boolean(library.diamondProjects.find(project => project.id === row.targetId)?.imageUrl);
  }

  if (row.targetType === 'coloring-book-cover') {
    return Boolean(library.coloringBooks.find(book => book.id === row.targetId)?.coverImage);
  }

  return false;
}

export function analyzePhotoFiles(
  files: BulkPhotoFileInput[],
  library: BulkPhotoLibrary,
  manifests: BulkPhotoManifestEntry[] = []
): BulkPhotoReviewRow[] {
  validateUniqueManifestPaths(manifests);
  const imageFiles = files
    .filter(({ file }) => isImageFile(file))
    .map(({ file, path }) => ({
      file,
      resolvedPath: path || file.webkitRelativePath || file.name,
    }));

  const ambiguousBasenames = findAmbiguousBasenames(
    imageFiles.map(({ resolvedPath }) => resolvedPath)
  );

  return imageFiles.map(({ file, resolvedPath }, index) => {
    const match = matchPhotoFile(resolvedPath, library, manifests, ambiguousBasenames);
    const row: BulkPhotoReviewRow = {
      id: `${index}-${resolvedPath}`,
      file,
      path: resolvedPath,
      ...match,
      confirmed: match.confidence === 'manifest' || match.confidence === 'high',
      excluded: match.confidence === 'unmatched',
      overwrite: false,
    };

    if (targetHasExistingCover(row, library)) {
      row.confirmed = false;
      row.excluded = true;
      row.skipReasonCode = 'existing-cover';
      row.skipReason = 'Existing cover will not be overwritten unless you opt in.';
    }

    return row;
  });
}
