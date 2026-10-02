import { pb } from '@/lib/pocketbase';
import { getCurrentUserId } from '@/services/auth';
import { colorReferenceNotesSchema } from '@/schemas/colorReferenceSchema';
import type { ColoringPageColorReferencesResponse } from '@/types/pocketbase.types';

export type ColorReference = ColoringPageColorReferencesResponse;
export type ColorReferenceChange =
  | { action: 'notes'; notes: string; baselineNotes: string }
  | { action: 'photos'; files: File[]; requestId: string }
  | { action: 'remove'; filename: string }
  | { action: 'restore'; notes: string; files: File[]; restoreKey: string; restoreOffset?: number };

function requireOwner(userId: string) {
  if (!userId || getCurrentUserId() !== userId)
    throw new Error('Your account changed. Reopen this page.');
}

export type ColorReferenceRestoreResult = { referenceId: string; addedPhotoCount: number };

async function submitChange(pageId: string, userId: string, change: ColorReferenceChange) {
  requireOwner(userId);
  const body = new FormData();
  body.set('action', change.action);
  if ('notes' in change) {
    body.set('notes', colorReferenceNotesSchema.parse(change.notes));
    body.set('baselineNotes', 'baselineNotes' in change ? change.baselineNotes : '');
  }
  if ('files' in change) change.files.forEach(file => body.append('photos', file));
  if ('requestId' in change) body.set('requestId', change.requestId);
  if ('restoreKey' in change) {
    body.set('restoreKey', change.restoreKey);
    body.set('restoreOffset', String(change.restoreOffset ?? 0));
  }
  if ('filename' in change) body.set('filename', change.filename);
  const result = await pb.send<{ reference: ColorReference | null; addedPhotoCount?: number }>(
    `/api/coloring/pages/${encodeURIComponent(pageId)}/color-reference`,
    { method: 'POST', body }
  );
  requireOwner(userId);
  return result;
}

export const ColorReferencesService = {
  async get(pageId: string, userId: string): Promise<ColorReference | null> {
    requireOwner(userId);
    const records = await pb.collection('coloring_page_color_references').getList(1, 1, {
      filter: pb.filter('page = {:page} && user = {:user}', { page: pageId, user: userId }),
    });
    requireOwner(userId);
    return records.items[0] ?? null;
  },
  async list(userId: string): Promise<ColorReference[]> {
    requireOwner(userId);
    return pb.collection('coloring_page_color_references').getFullList({
      filter: pb.filter('user = {:user}', { user: userId }),
    });
  },
  async save(
    pageId: string,
    userId: string,
    change: ColorReferenceChange
  ): Promise<ColorReference | null> {
    return (await submitChange(pageId, userId, change)).reference;
  },
  async restore(
    pageId: string,
    userId: string,
    change: Extract<ColorReferenceChange, { action: 'restore' }>
  ): Promise<ColorReferenceRestoreResult> {
    const result = await submitChange(pageId, userId, change);
    if (
      !result.reference ||
      typeof result.addedPhotoCount !== 'number' ||
      !Number.isSafeInteger(result.addedPhotoCount) ||
      result.addedPhotoCount < 0 ||
      result.addedPhotoCount > change.files.length
    ) {
      throw new Error('Could not confirm the restored photos. Your import progress has been kept.');
    }
    return { referenceId: result.reference.id, addedPhotoCount: result.addedPhotoCount };
  },
  async urls(reference: ColorReference, userId: string) {
    requireOwner(userId);
    if (!reference.photos.length) return [];
    return reference.photos.map(filename => ({
      filename,
      thumbnail: pb.files.getURL(reference, filename, { thumb: '320x320f' }),
      original: pb.files.getURL(reference, filename),
    }));
  },
};
