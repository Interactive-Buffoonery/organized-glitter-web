import { z } from 'zod';
import {
  calculateInventoryDigest,
  calculateItemDigest,
  calculateParentDescriptorDigest,
  canonicalJson,
} from './canonical';
import {
  ARCHIVE_FILE_ROLES,
  ARCHIVE_ITEM_KINDS,
  type ArchiveParentDescriptorV3,
  type ArchivePartManifestV3,
  type ArchiveItemV3,
  type ArchiveItemWithoutDigestV3,
  type ColoringPageMetadata,
} from './types';

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const id = z.string().min(1).max(255);
const optionalText = z.string().optional();
const nonnegativeInt = z.number().int().nonnegative();
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const project = strict({
  title: z.string(),
  company: optionalText,
  artist: optionalText,
  status: z.enum([
    'wishlist',
    'purchased',
    'stash',
    'kitted',
    'progress',
    'onhold',
    'completed',
    'archived',
    'destashed',
  ]),
  kitCategory: z.enum(['full', 'mini']).optional(),
  drillShape: optionalText,
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  totalDiamonds: nonnegativeInt.optional(),
  colorCount: nonnegativeInt.optional(),
  datePurchased: optionalText,
  dateReceived: optionalText,
  dateStarted: optionalText,
  dateCompleted: optionalText,
  generalNotes: optionalText,
  sourceUrl: optionalText,
  tags: z.array(z.string()),
});
const note = strict({ content: z.string(), date: z.string() });
const medium = strict({
  name: z.string(),
  type: z.enum([
    'colored_pencil',
    'alcohol_marker',
    'water_based_marker',
    'gel_pen',
    'watercolor',
    'pastel',
    'other',
    'acrylic_paint_pen',
  ]),
  brand: optionalText,
  colorCount: nonnegativeInt.optional(),
  notes: optionalText,
});
const book = strict({
  title: z.string(),
  publisher: optionalText,
  illustrator: optionalText,
  series: optionalText,
  theme: optionalText,
  isbn: optionalText,
  publicationYear: z.number().int().optional(),
  edition: optionalText,
  language: z
    .enum(['', 'english', 'spanish', 'french', 'german', 'japanese', 'other', 'unknown'])
    .optional(),
  sourceUrl: optionalText,
  datePurchased: optionalText,
  dateReceived: optionalText,
  dateStarted: optionalText,
  dateCompleted: optionalText,
  bookFormat: z
    .enum(['', 'paperback', 'hardcover', 'pdf', 'printable_pages', 'magazine', 'other'])
    .optional(),
  notes: optionalText,
  isMystery: z.boolean(),
  status: z.enum([
    'wishlist',
    'purchased',
    'in_stash',
    'in_progress',
    'completed',
    'archived',
    'destashed',
  ]),
  totalPages: nonnegativeInt,
  completedPages: nonnegativeInt.optional(),
  completionPercentage: z.number().min(0).max(100).optional(),
  lastActivityAt: optionalText,
  tags: z.array(z.string()),
});
const page = strict({
  pageNumber: z.number().int().positive(),
  status: z.enum(['not_started', 'palette_chosen', 'in_progress', 'on_hold', 'completed']),
  mediumItemIds: z.array(id),
  revealedSubject: optionalText,
  revealedAt: optionalText,
  startedAt: optionalText,
  completedAt: optionalText,
});
const reference = strict({ notes: z.string() });
const assetMetadata = strict({
  position: nonnegativeInt,
  ownerItemId: id.optional(),
});
const metadata = {
  'diamond-project': project,
  'diamond-project-note': note,
  'coloring-medium': medium,
  'coloring-book': book,
  'coloring-page': page,
  'coloring-page-note': note,
  'coloring-color-reference': reference,
  asset: assetMetadata,
} as const;
function safeAssetPath(path: string): boolean {
  const segments = path.split('/');
  const filename = segments[2] ?? '';
  const hasControlCharacter = Array.from(filename).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  return (
    segments.length === 3 &&
    segments[0] === 'assets' &&
    /^[A-Za-z0-9._:-]+$/.test(segments[1]) &&
    segments[1] !== '.' &&
    segments[1] !== '..' &&
    segments[2] !== '.' &&
    segments[2] !== '..' &&
    segments[2].length > 0 &&
    !filename.includes('\\') &&
    !hasControlCharacter
  );
}
const asset = strict({
  assetId: id,
  digest: sha,
  byteLength: nonnegativeInt,
  path: z.string().refine(safeAssetPath, 'Unsafe asset path'),
  role: z.enum(ARCHIVE_FILE_ROLES),
  field: id,
  originalFilename: optionalText,
  contentType: optionalText,
});

function parseParent(value: unknown, depth = 0): ArchiveParentDescriptorV3 {
  if (depth > 2) throw new Error('Parent descriptor chain is too deep');
  const base = strict({
    itemId: id,
    kind: z.enum(['diamond-project', 'coloring-book', 'coloring-page']),
    digest: sha,
    parent: z.unknown().optional(),
    metadata: z.unknown(),
  }).parse(value);
  const parsed = {
    ...base,
    metadata: metadata[base.kind].parse(base.metadata),
    ...(base.parent !== undefined ? { parent: parseParent(base.parent, depth + 1) } : {}),
  } as ArchiveParentDescriptorV3;
  if (base.kind === 'coloring-page' && (!parsed.parent || parsed.parent.kind !== 'coloring-book'))
    throw new Error('Coloring page parent descriptor must include its coloring book');
  if (base.kind !== 'coloring-page' && parsed.parent)
    throw new Error(`${base.kind} cannot have a parent descriptor`);
  const { digest, ...unsigned } = parsed;
  if (calculateParentDescriptorDigest(unsigned) !== digest)
    throw new Error(`Parent descriptor digest mismatch for ${base.itemId}`);
  return parsed;
}

export interface ArchiveFileInventory {
  paths: ReadonlySet<string>;
  entries?: ReadonlyMap<string, { byteLength: number; digest: string }>;
}
export function validateArchiveManifestV3(
  input: unknown,
  files?: ArchiveFileInventory
): ArchivePartManifestV3 {
  const base = strict({
    schemaVersion: z.literal(3),
    source: z.literal('organized-glitter'),
    backupId: z
      .string()
      .uuid()
      .regex(/^[0-9a-f-]+$/),
    exportedAt: z.string().datetime(),
    appVersion: optionalText,
    partNumber: z.number().int().positive(),
    partCount: z.number().int().positive(),
    partId: z.string(),
    inventoryDigest: sha,
    items: z.array(z.unknown()),
    warnings: z.array(
      strict({
        code: z.string(),
        message: z.string(),
        path: optionalText,
        recordRef: optionalText,
      })
    ),
  }).parse(input);
  if (base.partNumber > base.partCount || base.partId !== `${base.backupId}:${base.partNumber}`)
    throw new Error('Malformed archive part identity');
  const itemIds = new Set<string>(),
    assetIds = new Set<string>(),
    paths = new Set<string>(),
    parents = new Map<string, string>();
  const items = base.items.map(raw => {
    const shell = strict({
      itemId: id,
      kind: z.enum(ARCHIVE_ITEM_KINDS),
      digest: sha,
      parent: z.unknown().optional(),
      metadata: z.unknown(),
      assets: z.array(asset),
    }).parse(raw);
    if (itemIds.has(shell.itemId)) throw new Error(`Duplicate item ID: ${shell.itemId}`);
    itemIds.add(shell.itemId);
    const parsed = {
      ...shell,
      metadata: metadata[shell.kind].parse(shell.metadata),
      ...(shell.parent !== undefined ? { parent: parseParent(shell.parent) } : {}),
    } as ArchiveItemV3;
    if (
      shell.kind === 'diamond-project' ||
      shell.kind === 'coloring-book' ||
      shell.kind === 'coloring-medium'
    ) {
      if (parsed.parent) throw new Error(`${shell.kind} cannot have a parent`);
    } else if (!parsed.parent) throw new Error(`${shell.kind} requires a parent`);
    const expectedParent: Partial<Record<typeof shell.kind, ArchiveParentDescriptorV3['kind']>> = {
      'diamond-project-note': 'diamond-project',
      'coloring-page': 'coloring-book',
      'coloring-page-note': 'coloring-page',
      'coloring-color-reference': 'coloring-page',
      asset: 'coloring-page',
    };
    if (parsed.parent && expectedParent[shell.kind] !== parsed.parent.kind)
      throw new Error(`Wrong parent kind for ${shell.itemId}`);
    if (shell.kind === 'asset' && shell.assets.length !== 1)
      throw new Error(`Asset item ${shell.itemId} must declare exactly one asset`);
    if (shell.kind !== 'asset' && shell.assets.length > 1)
      throw new Error(`Item ${shell.itemId} declares too many assets`);
    const allowedRoles: Record<typeof shell.kind, readonly string[]> = {
      'diamond-project': ['project-cover'],
      'diamond-project-note': ['project-progress-note'],
      'coloring-medium': [],
      'coloring-book': ['coloring-book-cover'],
      'coloring-page': [],
      'coloring-page-note': ['coloring-page-progress-note'],
      'coloring-color-reference': [],
      asset: ['coloring-page-photo', 'coloring-swatch-photo'],
    };
    if (shell.assets.some(a => !allowedRoles[shell.kind].includes(a.role)))
      throw new Error(`Wrong asset role for ${shell.itemId}`);
    const allowedField: Partial<Record<typeof shell.kind, string>> = {
      'diamond-project': 'image',
      'diamond-project-note': 'image',
      'coloring-book': 'cover_image',
      'coloring-page-note': 'image',
    };
    if (allowedField[shell.kind] && shell.assets.some(a => a.field !== allowedField[shell.kind]))
      throw new Error(`Wrong asset field for ${shell.itemId}`);
    if (parsed.kind === 'asset') {
      const a = parsed.assets[0];
      if (a.field !== 'photos') throw new Error(`Wrong asset field for ${shell.itemId}`);
      if (a.role === 'coloring-swatch-photo' && !parsed.metadata.ownerItemId)
        throw new Error(`Swatch asset ${shell.itemId} requires ownerItemId`);
      if (a.role === 'coloring-page-photo' && parsed.metadata.ownerItemId)
        throw new Error(`Page photo ${shell.itemId} cannot have ownerItemId`);
    }
    for (const a of shell.assets) {
      if (a.path.split('/')[1] !== a.assetId)
        throw new Error(`Asset path does not match asset ID: ${a.assetId}`);
      if (assetIds.has(a.assetId)) throw new Error(`Duplicate asset ID: ${a.assetId}`);
      if (paths.has(a.path)) throw new Error(`Duplicate asset path: ${a.path}`);
      assetIds.add(a.assetId);
      paths.add(a.path);
    }
    if (parsed.parent) {
      const key = parsed.parent.itemId,
        value = canonicalJson(parsed.parent);
      if (parents.has(key) && parents.get(key) !== value)
        throw new Error(`Inconsistent parent descriptor: ${key}`);
      parents.set(key, value);
    }
    const { digest, ...unsigned } = parsed;
    if (calculateItemDigest(unsigned as ArchiveItemWithoutDigestV3) !== digest)
      throw new Error(`Item digest mismatch for ${shell.itemId}`);
    return parsed;
  });
  const result = { ...base, items } as ArchivePartManifestV3;
  const itemIndex = new Map(items.map((item, index) => [item.itemId, index]));
  for (const [index, item] of items.entries()) {
    const pageMetadata =
      item.kind === 'coloring-page'
        ? item.metadata
        : item.parent?.kind === 'coloring-page'
          ? (item.parent.metadata as ColoringPageMetadata)
          : undefined;
    if (pageMetadata) {
      for (const mediumItemId of pageMetadata.mediumItemIds) {
        const dependencyIndex = itemIndex.get(mediumItemId);
        if (
          dependencyIndex === undefined ||
          dependencyIndex >= index ||
          items[dependencyIndex].kind !== 'coloring-medium'
        )
          throw new Error(
            `Missing preceding coloring-medium dependency ${mediumItemId} for ${item.itemId}`
          );
      }
    }
    if (item.kind === 'asset' && item.assets[0].role === 'coloring-swatch-photo') {
      const dependencyIndex = itemIndex.get(item.metadata.ownerItemId!);
      const owner = dependencyIndex === undefined ? undefined : items[dependencyIndex];
      if (
        dependencyIndex === undefined ||
        dependencyIndex >= index ||
        owner?.kind !== 'coloring-color-reference' ||
        owner.parent?.itemId !== item.parent?.itemId ||
        owner.parent?.digest !== item.parent?.digest
      )
        throw new Error(
          `Missing preceding coloring-color-reference dependency ${item.metadata.ownerItemId} for ${item.itemId}`
        );
    }
  }
  const { inventoryDigest, ...unsigned } = result;
  if (calculateInventoryDigest(unsigned) !== inventoryDigest)
    throw new Error('Inventory digest mismatch');
  if (files) {
    if (!files.paths.has('manifest.json')) throw new Error('Missing manifest.json');
    for (const path of paths)
      if (!files.paths.has(path)) throw new Error(`Missing declared file: ${path}`);
    for (const path of files.paths)
      if (path !== 'manifest.json' && !paths.has(path)) throw new Error(`Undeclared file: ${path}`);
    for (const item of items)
      for (const descriptor of item.assets) {
        const actual = files.entries?.get(descriptor.path);
        if (files.entries && !actual)
          throw new Error(`Missing asset inventory entry: ${descriptor.path}`);
        if (actual && actual.byteLength !== descriptor.byteLength)
          throw new Error(`Asset length mismatch: ${descriptor.path}`);
        if (actual && actual.digest !== descriptor.digest)
          throw new Error(`Asset digest mismatch: ${descriptor.path}`);
      }
  }
  return result;
}
