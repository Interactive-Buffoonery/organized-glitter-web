import type { BulkPhotoReviewRow } from './types';

export function isImportableBulkRow(row: BulkPhotoReviewRow): boolean {
  return Boolean(row.confirmed && !row.excluded && row.targetId && row.targetType);
}
