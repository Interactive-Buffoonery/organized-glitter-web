import type {
  BulkPhotoLibrary,
  BulkPhotoManifestEntry,
  BulkPhotoMatch,
  BulkPhotoTargetType,
} from '@/features/import-export/bulk-photos/types';
import { findManifestForPath } from '@/features/import-export/bulk-photos/photoImportManifest';
import {
  defaultTargetTypeByKind,
  isTargetTypeForKind,
  parsePhotoTargetRef,
} from '@/features/import-export/bulk-photos/targetKinds';

const PROGRESS_TOKENS = new Set(['progress', 'wip', 'note', 'notes']);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function pathSegments(path: string): string[] {
  return path
    .split(/[\\/]/)
    .map(segment => normalizeText(segment.replace(/\.[a-z0-9]+$/i, '')))
    .filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pathContainsExactIdToken(path: string, id: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(id.toLowerCase())}([^a-z0-9]|$)`);
  return path.split(/[\\/]/).some(segment => pattern.test(segment.toLowerCase()));
}

function hasProgressToken(path: string): boolean {
  return pathSegments(path)
    .flatMap(segment => segment.split(/\s+/))
    .some(token => PROGRESS_TOKENS.has(token));
}

function labelForTarget(
  targetType: BulkPhotoTargetType,
  target: { title?: string; pageNumber?: number; bookTitle?: string }
): string {
  if (targetType === 'coloring-page-photo' || targetType === 'coloring-page-progress-note') {
    return `${target.bookTitle ?? 'Coloring book'}, page ${target.pageNumber ?? ''}`.trim();
  }
  return target.title ?? 'Matched record';
}

function manifestMatch(
  manifest: BulkPhotoManifestEntry,
  library: BulkPhotoLibrary
): BulkPhotoMatch | null {
  const invalidManifestMatch = (reason: string): BulkPhotoMatch => ({
    confidence: 'unmatched',
    reason,
    date: manifest.date,
    note: manifest.note,
  });

  if (manifest.targetRef) {
    const ref = parsePhotoTargetRef(manifest.targetRef);
    if (!ref) return invalidManifestMatch('Manifest target reference is invalid');
    const targetType = manifest.targetType ?? defaultTargetTypeByKind[ref.kind];
    if (!isTargetTypeForKind(ref.kind, targetType)) {
      return invalidManifestMatch('Manifest target type does not match its reference kind');
    }
    const target =
      ref.kind === 'project'
        ? library.diamondProjects.find(item => item.id === ref.id)
        : ref.kind === 'coloring-book'
          ? library.coloringBooks.find(item => item.id === ref.id)
          : library.coloringPages.find(item => item.id === ref.id);
    if (!target) return invalidManifestMatch('Manifest target reference was not found');
    return {
      targetType,
      targetId: target.id,
      targetLabel: labelForTarget(targetType, target),
      confidence: 'manifest',
      reason: 'Manifest target reference',
      date: manifest.date,
      note: manifest.note,
    };
  }

  if (manifest.title) {
    const normalizedTitle = compact(manifest.title);
    const project = library.diamondProjects.find(item => compact(item.title) === normalizedTitle);
    if (!project) return invalidManifestMatch('Manifest project title was not found');
    const targetType = manifest.targetType ?? 'project-cover';
    if (!isTargetTypeForKind('project', targetType)) {
      return invalidManifestMatch('Manifest target type does not match its project title');
    }
    return {
      targetType,
      targetId: project.id,
      targetLabel: labelForTarget(targetType, project),
      confidence: 'manifest',
      reason: 'Manifest title',
      date: manifest.date,
      note: manifest.note,
    };
  }

  return null;
}

function exactIdMatch(path: string, library: BulkPhotoLibrary): BulkPhotoMatch | null {
  const project = library.diamondProjects.find(item => pathContainsExactIdToken(path, item.id));
  if (project) {
    const targetType = hasProgressToken(path) ? 'project-progress-note' : 'project-cover';
    return {
      targetType,
      targetId: project.id,
      targetLabel: labelForTarget(targetType, project),
      confidence: 'high',
      reason: 'Filename or folder contains the project ID',
    };
  }

  const book = library.coloringBooks.find(item => pathContainsExactIdToken(path, item.id));
  if (book) {
    return {
      targetType: 'coloring-book-cover',
      targetId: book.id,
      targetLabel: labelForTarget('coloring-book-cover', book),
      confidence: 'high',
      reason: 'Filename or folder contains the coloring book ID',
    };
  }

  const page = library.coloringPages.find(item => pathContainsExactIdToken(path, item.id));
  if (page) {
    const targetType = hasProgressToken(path)
      ? 'coloring-page-progress-note'
      : 'coloring-page-photo';
    return {
      targetType,
      targetId: page.id,
      targetLabel: labelForTarget(targetType, page),
      confidence: 'high',
      reason: 'Filename or folder contains the coloring page ID',
    };
  }

  return null;
}

function exactTitleMatch(path: string, library: BulkPhotoLibrary): BulkPhotoMatch | null {
  const segments = pathSegments(path).map(compact);
  const project = library.diamondProjects.find(item => segments.includes(compact(item.title)));
  if (project) {
    const targetType = hasProgressToken(path) ? 'project-progress-note' : 'project-cover';
    return {
      targetType,
      targetId: project.id,
      targetLabel: labelForTarget(targetType, project),
      confidence: 'high',
      reason: 'Folder name exactly matches the project title',
    };
  }

  const book = library.coloringBooks.find(item => segments.includes(compact(item.title)));
  if (book) {
    return {
      targetType: 'coloring-book-cover',
      targetId: book.id,
      targetLabel: labelForTarget('coloring-book-cover', book),
      confidence: 'high',
      reason: 'Folder name exactly matches the coloring book title',
    };
  }

  return null;
}

function coloringPageNumberMatch(path: string, library: BulkPhotoLibrary): BulkPhotoMatch | null {
  const pageMatch =
    path.match(/(?:page|p)[\s_-]*(\d{1,4})/i) ?? path.match(/(?:^|[\\/])(\d{1,4})(?:[\\/._-]|$)/);
  const pageNumber = pageMatch ? Number(pageMatch[1]) : NaN;
  if (!Number.isFinite(pageNumber)) return null;

  const book = library.coloringBooks.find(item =>
    pathSegments(path).some(segment => compact(segment) === compact(item.title))
  );
  const page = library.coloringPages.find(
    item => item.pageNumber === pageNumber && (!book || item.bookId === book.id)
  );
  if (!page) return null;

  const targetType = hasProgressToken(path) ? 'coloring-page-progress-note' : 'coloring-page-photo';

  return {
    targetType,
    targetId: page.id,
    targetLabel: labelForTarget(targetType, page),
    confidence: book ? 'high' : 'medium',
    reason: book ? 'Book folder and page number match' : 'Coloring page number match',
  };
}

function filenameTokenMatch(path: string, library: BulkPhotoLibrary): BulkPhotoMatch | null {
  const normalizedPath = compact(path);
  const project = library.diamondProjects.find(project =>
    normalizeText(project.title)
      .split(/\s+/)
      .filter(token => token.length > 2)
      .some(token => normalizedPath.includes(token))
  );

  if (project) {
    const targetType = hasProgressToken(path) ? 'project-progress-note' : 'project-cover';
    return {
      targetType,
      targetId: project.id,
      targetLabel: labelForTarget(targetType, project),
      confidence: 'low',
      reason: 'Filename token matches the project title',
    };
  }

  return null;
}

export function matchPhotoFile(
  path: string,
  library: BulkPhotoLibrary,
  manifests: BulkPhotoManifestEntry[] = [],
  ambiguousBasenames: Set<string> = new Set()
): BulkPhotoMatch {
  const manifest = findManifestForPath(manifests, path, ambiguousBasenames);
  if (manifest) {
    const match = manifestMatch(manifest, library);
    if (match) return match;
  }

  return (
    exactIdMatch(path, library) ??
    coloringPageNumberMatch(path, library) ??
    exactTitleMatch(path, library) ??
    filenameTokenMatch(path, library) ?? {
      confidence: 'unmatched',
      reason: 'No matching record found',
    }
  );
}
