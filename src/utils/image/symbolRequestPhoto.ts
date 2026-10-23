import { normalizeImageFile } from '@/utils/image/imagePolicy';
import { compressUserImage } from '@/utils/image/sharedImageCompression';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

/** Shrinks a chosen photo to what coloring_symbol_requests accepts: JPG, PNG, or WebP up to 10 MB. */
export async function prepareSymbolRequestPhoto(input: File): Promise<File> {
  const file = await compressUserImage(normalizeImageFile(input));
  if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_BYTES)
    throw new Error('Choose a JPG, PNG, or WebP photo under 10 MB.');
  return file;
}
