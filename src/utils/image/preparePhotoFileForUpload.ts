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

export async function preparePhotoFileForUpload(file: File): Promise<File> {
  validateImageFile(file);
  const normalized = normalizeImageFile(file);
  return compressUserImage(normalized);
}
