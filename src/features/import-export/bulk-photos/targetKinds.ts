import type { BulkPhotoTargetType } from '@/features/import-export/bulk-photos/types';

export type BulkPhotoTargetKind = 'project' | 'coloring-book' | 'coloring-page';

export const targetTypesByKind: Record<BulkPhotoTargetKind, readonly BulkPhotoTargetType[]> = {
  project: ['project-cover', 'project-progress-note'],
  'coloring-book': ['coloring-book-cover'],
  'coloring-page': ['coloring-page-photo', 'coloring-page-progress-note'],
};

export const defaultTargetTypeByKind: Record<BulkPhotoTargetKind, BulkPhotoTargetType> = {
  project: 'project-cover',
  'coloring-book': 'coloring-book-cover',
  'coloring-page': 'coloring-page-photo',
};

export function kindForTargetType(targetType: BulkPhotoTargetType): BulkPhotoTargetKind {
  const kind = (Object.keys(targetTypesByKind) as BulkPhotoTargetKind[]).find(candidate =>
    targetTypesByKind[candidate].includes(targetType)
  );
  if (!kind) throw new Error(`Unknown photo target type: ${targetType}`);
  return kind;
}

export function isTargetTypeForKind(
  kind: BulkPhotoTargetKind,
  targetType: BulkPhotoTargetType
): boolean {
  return targetTypesByKind[kind].includes(targetType);
}

export function parsePhotoTargetRef(
  targetRef: string
): { kind: BulkPhotoTargetKind; id: string } | null {
  const match = /^(project|coloring-book|coloring-page):(.+)$/.exec(targetRef);
  return match ? { kind: match[1] as BulkPhotoTargetKind, id: match[2] } : null;
}
