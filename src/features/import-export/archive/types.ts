import type { ProjectStatus } from '@/types/project';
import type {
  ColoringBooksBookFormatOptions,
  ColoringBooksLanguageOptions,
  ColoringBooksStatusOptions,
  ColoringPagesStatusOptions,
} from '@/types/pocketbase.types';
import type { ColoringMediumType } from '@/types/coloringMedium';

type ArchiveRef =
  | `project:${string}`
  | `project-note:${string}`
  | `coloring-book:${string}`
  | `coloring-medium:${string}`
  | `coloring-page:${string}`
  | `coloring-page-note:${string}`
  | `coloring-color-reference:${string}`;

type ArchiveFileRole =
  | 'project-cover'
  | 'project-progress-note'
  | 'coloring-book-cover'
  | 'coloring-page-photo'
  | 'coloring-page-progress-note'
  | 'coloring-swatch-photo';

export interface ArchiveFileEntry {
  path: string;
  role: ArchiveFileRole;
  recordRef: ArchiveRef;
  field: string;
  originalFilename?: string;
  contentType?: string;
}

export interface ArchiveWarning {
  code: string;
  message: string;
  path?: string;
  recordRef?: ArchiveRef;
}

interface ArchiveDiamondProgressNote {
  ref: `project-note:${string}`;
  oldId: string;
  content: string;
  date: string;
  imagePath?: string;
}

export interface ArchiveDiamondProject {
  ref: `project:${string}`;
  oldId: string;
  title: string;
  company?: string;
  artist?: string;
  status: ProjectStatus;
  kitCategory?: 'full' | 'mini';
  drillShape?: string;
  width?: number;
  height?: number;
  totalDiamonds?: number;
  colorCount?: number;
  datePurchased?: string;
  dateReceived?: string;
  dateStarted?: string;
  dateCompleted?: string;
  generalNotes?: string;
  sourceUrl?: string;
  tags: string[];
  coverPhotoPath?: string;
  progressNotes: ArchiveDiamondProgressNote[];
}

interface ArchiveColoringPageProgressNote {
  ref: `coloring-page-note:${string}`;
  oldId: string;
  content: string;
  date: string;
  imagePath?: string;
}

export interface ArchiveColorReference {
  ref: `coloring-color-reference:${string}`;
  notes: string;
  photoPaths: string[];
}

export interface ArchiveColoringPage {
  ref: `coloring-page:${string}`;
  oldId: string;
  pageNumber: number;
  colorReference?: ArchiveColorReference;
  status: ColoringPagesStatusOptions;
  mediumRefs: Array<`coloring-medium:${string}`>;
  mediumIds?: string[];
  revealedSubject?: string;
  revealedAt?: string;
  startedAt?: string;
  completedAt?: string;
  photoPaths: string[];
  progressNotes: ArchiveColoringPageProgressNote[];
}

export interface ArchiveColoringMedium {
  ref: `coloring-medium:${string}`;
  oldId: string;
  name: string;
  type: ColoringMediumType;
  brand?: string;
  colorCount?: number;
  notes?: string;
}

export interface ArchiveColoringBook {
  ref: `coloring-book:${string}`;
  oldId: string;
  title: string;
  publisher?: string;
  illustrator?: string;
  series?: string;
  theme?: string;
  isbn?: string;
  publicationYear?: number;
  edition?: string;
  language?: ColoringBooksLanguageOptions | '';
  sourceUrl?: string;
  datePurchased?: string;
  dateReceived?: string;
  dateStarted?: string;
  dateCompleted?: string;
  bookFormat?: ColoringBooksBookFormatOptions | '';
  notes?: string;
  isMystery: boolean;
  status: ColoringBooksStatusOptions;
  totalPages: number;
  completedPages?: number;
  completionPercentage?: number;
  lastActivityAt?: string;
  tags: string[];
  coverPhotoPath?: string;
  pages: ArchiveColoringPage[];
}

export interface OrganizedGlitterArchiveManifestV1 {
  schemaVersion: 1 | 2;
  exportedAt: string;
  appVersion?: string;
  source: 'organized-glitter';
  files: ArchiveFileEntry[];
  diamondProjects: ArchiveDiamondProject[];
  coloringMediums: ArchiveColoringMedium[];
  coloringBooks: ArchiveColoringBook[];
  warnings: ArchiveWarning[];
}

export interface ArchiveExportResult {
  success: boolean;
  filename?: string;
  warningCount: number;
  warnings: ArchiveWarning[];
  error?: string;
  archiveSchemaVersion?: OrganizedGlitterArchiveManifestV1['schemaVersion'];
}

export interface ArchiveImportResult {
  success: boolean;
  createdProjectCount: number;
  createdColoringBookCount: number;
  createdProgressNoteCount: number;
  importedPhotoCount: number;
  skippedRecordCount: number;
  skippedPagePhotoCount: number;
  matchedExistingRecordCount: number;
  archiveSchemaVersion: OrganizedGlitterArchiveManifestV1['schemaVersion'];
  refMap: Partial<Record<ArchiveRef, string>>;
  warnings: ArchiveWarning[];
  errors: string[];
}
