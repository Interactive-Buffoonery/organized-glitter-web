import {
  IMAGE_MAX_FILE_SIZE_BYTES,
  hasSupportedImageExtension,
  isSupportedImageMime,
  normalizeImageFile,
} from '@/utils/image/imagePolicy';
import { compressUserImage } from './sharedImageCompression';

function validateImageFile(file: File): void {
  if (file.size > IMAGE_MAX_FILE_SIZE_BYTES) {
    throw new Error('Image exceeds the 50MB upload limit');
  }

  if (!isSupportedImageMime(file.type) && !hasSupportedImageExtension(file.name)) {
    throw new Error('Unsupported image type');
  }
}

/**
 * Prepares archive and bulk-import photos regardless of destination. Both former
 * target-specific compressors used these same options, with no size-based skip.
 * The shared compressor can return the normalized original on failure at <=5MiB.
 * Propagate remaining failures so import callers report the failed photo instead
 * of applying either interactive hook's additional original-file fallback.
 */
export async function preparePhotoFileForUpload(file: File): Promise<File> {
  validateImageFile(file);
  const normalized = normalizeImageFile(file);
  return compressUserImage(normalized);
}
