export type Sha256 = string;

export const ARCHIVE_ITEM_KINDS = [
  'diamond-project',
  'diamond-project-note',
  'coloring-medium',
  'coloring-book',
  'coloring-page',
  'coloring-page-note',
  'coloring-color-reference',
  'asset',
] as const;
export type ArchiveItemKind = (typeof ARCHIVE_ITEM_KINDS)[number];

export const ARCHIVE_FILE_ROLES = [
  'project-cover',
  'project-progress-note',
  'coloring-book-cover',
  'coloring-page-photo',
  'coloring-page-progress-note',
  'coloring-swatch-photo',
] as const;
export type ArchiveFileRole = (typeof ARCHIVE_FILE_ROLES)[number];

export interface ArchiveAssetDescriptorV3 {
  assetId: string;
  digest: Sha256;
  byteLength: number;
  path: string;
  role: ArchiveFileRole;
  field: string;
  originalFilename?: string;
  contentType?: string;
}

export interface ArchiveParentDescriptorV3 {
  itemId: string;
  kind: 'diamond-project' | 'coloring-book' | 'coloring-page';
  digest: Sha256;
  parent?: ArchiveParentDescriptorV3;
  metadata: DiamondProjectMetadata | ColoringBookMetadata | ColoringPageMetadata;
}

export interface DiamondProjectMetadata {
  title: string;
  company?: string;
  artist?: string;
  status:
    | 'wishlist'
    | 'purchased'
    | 'stash'
    | 'kitted'
    | 'progress'
    | 'onhold'
    | 'completed'
    | 'archived'
    | 'destashed';
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
}
export interface ProgressNoteMetadata {
  content: string;
  date: string;
}
export interface ColoringMediumMetadata {
  name: string;
  type:
    | 'colored_pencil'
    | 'alcohol_marker'
    | 'water_based_marker'
    | 'gel_pen'
    | 'watercolor'
    | 'pastel'
    | 'other'
    | 'acrylic_paint_pen';
  brand?: string;
  colorCount?: number;
  notes?: string;
}
export interface ColoringBookMetadata {
  title: string;
  publisher?: string;
  illustrator?: string;
  series?: string;
  theme?: string;
  isbn?: string;
  publicationYear?: number;
  edition?: string;
  language?: '' | 'english' | 'spanish' | 'french' | 'german' | 'japanese' | 'other' | 'unknown';
  sourceUrl?: string;
  datePurchased?: string;
  dateReceived?: string;
  dateStarted?: string;
  dateCompleted?: string;
  bookFormat?: '' | 'paperback' | 'hardcover' | 'pdf' | 'printable_pages' | 'magazine' | 'other';
  notes?: string;
  isMystery: boolean;
  status:
    | 'wishlist'
    | 'purchased'
    | 'in_stash'
    | 'in_progress'
    | 'completed'
    | 'archived'
    | 'destashed';
  totalPages: number;
  completedPages?: number;
  completionPercentage?: number;
  lastActivityAt?: string;
  tags: string[];
}
export interface ColoringPageMetadata {
  pageNumber: number;
  status: 'not_started' | 'palette_chosen' | 'in_progress' | 'on_hold' | 'completed';
  mediumItemIds: string[];
  revealedSubject?: string;
  revealedAt?: string;
  startedAt?: string;
  completedAt?: string;
}
export interface ColorReferenceMetadata {
  notes: string;
}
export interface AssetItemMetadata {
  position: number;
  ownerItemId?: string;
}

export interface ArchiveItemMetadataByKind {
  'diamond-project': DiamondProjectMetadata;
  'diamond-project-note': ProgressNoteMetadata;
  'coloring-medium': ColoringMediumMetadata;
  'coloring-book': ColoringBookMetadata;
  'coloring-page': ColoringPageMetadata;
  'coloring-page-note': ProgressNoteMetadata;
  'coloring-color-reference': ColorReferenceMetadata;
  asset: AssetItemMetadata;
}

export type ArchiveItemV3 = {
  [K in ArchiveItemKind]: {
    itemId: string;
    kind: K;
    digest: Sha256;
    parent?: ArchiveParentDescriptorV3;
    metadata: ArchiveItemMetadataByKind[K];
    assets: ArchiveAssetDescriptorV3[];
  };
}[ArchiveItemKind];

export interface ArchiveWarning {
  code: string;
  message: string;
  path?: string;
  recordRef?: string;
}
export interface ArchivePartManifestV3 {
  schemaVersion: 3;
  source: 'organized-glitter';
  backupId: string;
  exportedAt: string;
  appVersion?: string;
  partNumber: number;
  partCount: number;
  partId: string;
  inventoryDigest: Sha256;
  items: ArchiveItemV3[];
  warnings: ArchiveWarning[];
}

export type ArchiveItemWithoutDigestV3 = {
  [K in ArchiveItemKind]: Omit<Extract<ArchiveItemV3, { kind: K }>, 'digest'>;
}[ArchiveItemKind];
