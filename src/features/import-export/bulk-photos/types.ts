import type { Project } from '@/types/project';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';

export type BulkPhotoTargetType =
  | 'project-cover'
  | 'project-progress-note'
  | 'coloring-book-cover'
  | 'coloring-page-photo'
  | 'coloring-page-progress-note';

type BulkPhotoConfidence = 'manifest' | 'high' | 'medium' | 'low' | 'unmatched';

export interface BulkPhotoFileInput {
  file: File;
  path?: string;
}

export interface BulkPhotoManifestEntry {
  path: string;
  targetType?: BulkPhotoTargetType;
  targetRef?: string;
  title?: string;
  pageNumber?: number;
  date?: string;
  note?: string;
}

export interface BulkPhotoLibrary {
  diamondProjects: Project[];
  coloringBooks: ColoringBookDTO[];
  coloringPages: Array<ColoringPageDTO & { bookTitle?: string }>;
}

export interface BulkPhotoMatch {
  targetType?: BulkPhotoTargetType;
  targetId?: string;
  targetLabel?: string;
  confidence: BulkPhotoConfidence;
  reason: string;
  date?: string;
  note?: string;
}

export interface BulkPhotoReviewRow extends BulkPhotoMatch {
  id: string;
  file: File;
  path: string;
  confirmed: boolean;
  excluded: boolean;
  overwrite: boolean;
  skipReasonCode?: 'existing-cover';
  skipReason?: string;
  error?: string;
}

export interface BulkPhotoImportResult {
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  createdProgressNoteCount: number;
  overwriteCount: number;
  errors: Array<{ path: string; message: string }>;
}
