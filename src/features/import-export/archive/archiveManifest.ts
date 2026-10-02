import { COLORING_BOOK_MAX_PAGES } from '@/constants/coloringBookMetadata';
import { assertArchiveManifestRecordLimits } from '@/features/import-export/archive/archiveImportLimits';
import type {
  ArchiveWarning,
  OrganizedGlitterArchiveManifestV1,
} from '@/features/import-export/archive/types';

function isSafeArchivePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\')) return false;
  if (path.includes('\0') || /%00/i.test(path)) return false;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (decodedPath.startsWith('/') || decodedPath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(decodedPath)) return false;
  const parts = decodedPath.replace(/\\/g, '/').split('/');
  return parts.every(part => part !== '..' && part !== '');
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Archive manifest is missing required ${name} array`);
  }
}

export function validateArchiveManifest(value: unknown): OrganizedGlitterArchiveManifestV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('Archive manifest must be an object');
  }

  const manifest = value as Partial<OrganizedGlitterArchiveManifestV1>;
  assertArchiveManifestRecordLimits(manifest);

  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) {
    throw new Error(`Unsupported archive schema version: ${String(manifest.schemaVersion)}`);
  }

  if (manifest.source !== 'organized-glitter') {
    throw new Error('Archive was not created by Organized Glitter');
  }

  assertArray(manifest.files, 'files');
  assertArray(manifest.diamondProjects, 'diamondProjects');
  if (!Array.isArray(manifest.coloringMediums)) {
    manifest.coloringMediums = [];
  }
  assertArray(manifest.coloringBooks, 'coloringBooks');
  assertArray(manifest.warnings, 'warnings');

  for (const file of manifest.files) {
    if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
      throw new Error('Archive manifest contains an invalid file entry');
    }
    if (!isSafeArchivePath(file.path)) {
      throw new Error(`Archive contains an unsafe file path: ${file.path}`);
    }
  }

  const diamondProjectRefs = new Set<string>();
  for (const project of manifest.diamondProjects) {
    if (
      !project.title ||
      typeof project.ref !== 'string' ||
      !project.ref.startsWith('project:') ||
      !project.ref.slice('project:'.length) ||
      typeof project.oldId !== 'string' ||
      !project.oldId
    ) {
      throw new Error('Archive manifest contains an invalid diamond project');
    }
    if (diamondProjectRefs.has(project.ref)) {
      throw new Error('Archive manifest contains a duplicate diamond project reference');
    }
    diamondProjectRefs.add(project.ref);
    if (
      project.colorCount !== undefined &&
      (!Number.isSafeInteger(project.colorCount) || project.colorCount < 0)
    ) {
      throw new Error('Archive diamond project colorCount must be a non-negative safe integer');
    }
    assertArray(project.tags, 'diamond project tags');
    assertArray(project.progressNotes, 'diamond project progressNotes');
    if (project.coverPhotoPath && !isSafeArchivePath(project.coverPhotoPath)) {
      throw new Error(`Archive contains an unsafe file path: ${project.coverPhotoPath}`);
    }
    project.progressNotes.forEach(note => {
      if (note.imagePath && !isSafeArchivePath(note.imagePath)) {
        throw new Error(`Archive contains an unsafe file path: ${note.imagePath}`);
      }
    });
  }

  for (const medium of manifest.coloringMediums) {
    if (!medium.name || !medium.ref || !medium.oldId || !medium.type) {
      throw new Error('Archive manifest contains an invalid coloring medium');
    }
  }

  const coloringBookRefs = new Set<string>();
  const coloringPageRefs = new Set<string>();
  for (const book of manifest.coloringBooks) {
    if (!book.title || !book.ref || !book.oldId) {
      throw new Error('Archive manifest contains an invalid coloring book');
    }
    if (coloringBookRefs.has(book.ref)) {
      throw new Error('Archive manifest contains a duplicate coloring book reference');
    }
    coloringBookRefs.add(book.ref);
    if (!Number.isSafeInteger(book.totalPages) || book.totalPages < 1) {
      throw new Error('Archive coloring book totalPages must be a positive safe integer');
    }
    assertArray(book.tags, 'coloring book tags');
    assertArray(book.pages, 'coloring book pages');
    const pageNumbers = new Set<number>();
    for (const page of book.pages) {
      if (!page.ref || !page.oldId) {
        throw new Error('Archive manifest contains an invalid coloring page');
      }
      if (coloringPageRefs.has(page.ref)) {
        throw new Error('Archive manifest contains a duplicate coloring page reference');
      }
      coloringPageRefs.add(page.ref);
      if (
        !Number.isSafeInteger(page.pageNumber) ||
        page.pageNumber < 1 ||
        page.pageNumber > book.totalPages ||
        pageNumbers.has(page.pageNumber)
      ) {
        throw new Error('Archive coloring book contains an invalid or duplicate page number');
      }
      pageNumbers.add(page.pageNumber);
    }
    if (book.totalPages > COLORING_BOOK_MAX_PAGES && pageNumbers.size !== book.totalPages) {
      throw new Error(
        'Archive coloring books above 500 pages must include every declared page exactly once'
      );
    }
    if (book.coverPhotoPath && !isSafeArchivePath(book.coverPhotoPath)) {
      throw new Error(`Archive contains an unsafe file path: ${book.coverPhotoPath}`);
    }
    book.pages.forEach(page => {
      if (!Array.isArray(page.mediumRefs)) {
        page.mediumRefs = [];
      }
      if (page.mediumIds !== undefined) {
        assertArray(page.mediumIds, 'coloring page mediumIds');
      }
      if (page.colorReference !== undefined) {
        const reference = page.colorReference;
        if (
          !reference ||
          typeof reference.notes !== 'string' ||
          reference.notes.length > 100000 ||
          typeof reference.ref !== 'string' ||
          !reference.ref.startsWith('coloring-color-reference:')
        ) {
          throw new Error('Archive contains an invalid color reference');
        }
        assertArray(reference.photoPaths, 'swatch photoPaths');
        if (
          reference.photoPaths.length > 100 ||
          reference.photoPaths.some(path => typeof path !== 'string' || !isSafeArchivePath(path))
        ) {
          throw new Error('Archive contains invalid swatch photo paths');
        }
      }
      assertArray(page.photoPaths, 'coloring page photoPaths');
      assertArray(page.progressNotes, 'coloring page progressNotes');
      page.mediumRefs.forEach(ref => {
        if (!ref.startsWith('coloring-medium:')) {
          throw new Error('Archive manifest contains an invalid coloring page medium reference');
        }
      });
      page.photoPaths.forEach(path => {
        if (!isSafeArchivePath(path)) {
          throw new Error(`Archive contains an unsafe file path: ${path}`);
        }
      });
      page.progressNotes.forEach(note => {
        if (note.imagePath && !isSafeArchivePath(note.imagePath)) {
          throw new Error(`Archive contains an unsafe file path: ${note.imagePath}`);
        }
      });
    });
  }

  return manifest as OrganizedGlitterArchiveManifestV1;
}

function collectManifestPhotoPaths(manifest: OrganizedGlitterArchiveManifestV1): string[] {
  const paths = new Set<string>();

  manifest.files.forEach(file => {
    if (isSafeArchivePath(file.path)) paths.add(file.path);
  });

  manifest.diamondProjects.forEach(project => {
    if (project.coverPhotoPath) paths.add(project.coverPhotoPath);
    project.progressNotes.forEach(note => {
      if (note.imagePath) paths.add(note.imagePath);
    });
  });

  manifest.coloringBooks.forEach(book => {
    if (book.coverPhotoPath) paths.add(book.coverPhotoPath);
    book.pages.forEach(page => {
      page.photoPaths.forEach(path => paths.add(path));
      page.progressNotes.forEach(note => {
        if (note.imagePath) paths.add(note.imagePath);
      });
    });
  });

  return Array.from(paths);
}

export function findMissingOptionalPhotoWarnings(
  manifest: OrganizedGlitterArchiveManifestV1,
  availablePaths: Set<string>
): ArchiveWarning[] {
  return collectManifestPhotoPaths(manifest)
    .filter(path => !availablePaths.has(path))
    .map(path => ({
      code: 'missing-photo-file',
      message: `Archive manifest references a photo that is not present: ${path}`,
      path,
    }));
}
