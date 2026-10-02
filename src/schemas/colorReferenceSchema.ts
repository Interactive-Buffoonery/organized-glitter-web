import { z } from 'zod';

export const colorReferenceNotesSchema = z.string().max(100000, 'Notes are too long.');

export const hasColorReferenceContent = (reference: { notes: string; photos: string[] } | null) =>
  Boolean(reference && (reference.notes.trim() || reference.photos.length));
