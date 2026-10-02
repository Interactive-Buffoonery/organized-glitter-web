import { logger } from '@/utils/logger';
import {
  IMAGE_MIME_TYPES,
  inferImageMimeFromExtension,
  isSupportedImageMime,
} from '@/utils/image/imagePolicy';

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
}

export interface CroppedImageFileOptions {
  fileName: string;
  width: number;
  height: number;
  type?: string;
  quality?: number;
}

export interface ContainedImageFileOptions extends CroppedImageFileOptions {
  background?: 'blur' | 'solid';
  backgroundColor?: string;
}

// Mirrors the image field allowlists used by PocketBase. PB sniffs the byte
// stream and rejects uploads whose MIME type is not in this list, so anything
// we send should normalize to one of these.
export const POCKETBASE_IMAGE_MIME_TYPES = IMAGE_MIME_TYPES;

/**
 * Infer a PocketBase-compatible MIME type from a filename's extension. Used
 * when the browser hands us a File with an empty or non-standard `type` field
 * (common with iOS/HEIC files shared via cloud sync), so the multipart request
 * carries a recognisable Content-Type rather than `application/octet-stream`.
 */
export function inferMimeFromExtension(name: string): string | null {
  return inferImageMimeFromExtension(name);
}

export function isPocketBaseImageMime(type: string | undefined | null): boolean {
  return isSupportedImageMime(type);
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_QUALITY = 0.9;

/**
 * Validate image file type and size
 */
export function validateImageFile(file: File): ValidationResult {
  if (!file) {
    return {
      isValid: false,
      error: 'No file provided.',
    };
  }

  // Check file type
  if (!isSupportedImageMime(file.type)) {
    return {
      isValid: false,
      error: 'Please upload a JPEG, PNG, WebP, or HEIC image file.',
    };
  }

  // Check file size (50MB max before compression - let compression handle optimization)
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `Image file must be smaller than ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
    };
  }

  // Check for minimum file size (prevent corrupted files)
  if (file.size < 100) {
    return {
      isValid: false,
      error: 'Image file appears to be corrupted or too small.',
    };
  }

  return { isValid: true };
}

function loadImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for processing'));
    if (imageSrc.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = imageSrc;
  });
}

export async function createContainedImageFile(
  imageSrc: string,
  options: ContainedImageFileOptions
): Promise<File> {
  if (!imageSrc || typeof imageSrc !== 'string') {
    throw new Error('Invalid image source');
  }

  if (options.width <= 0 || options.height <= 0) {
    throw new Error('Invalid output dimensions');
  }

  const type = options.type ?? 'image/jpeg';
  const quality = options.quality ?? DEFAULT_QUALITY;
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  canvas.width = options.width;
  canvas.height = options.height;

  const background = options.background ?? 'blur';
  if (background === 'solid') {
    ctx.fillStyle = options.backgroundColor ?? '#f3f4f6';
    ctx.fillRect(0, 0, options.width, options.height);
  } else {
    const coverScale = Math.max(options.width / img.width, options.height / img.height);
    const coverWidth = img.width * coverScale;
    const coverHeight = img.height * coverScale;
    const coverX = (options.width - coverWidth) / 2;
    const coverY = (options.height - coverHeight) / 2;

    ctx.save();
    ctx.filter = 'blur(28px)';
    ctx.drawImage(img, coverX, coverY, coverWidth, coverHeight);
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(0, 0, options.width, options.height);
  }

  const containScale = Math.min(options.width / img.width, options.height / img.height);
  const containWidth = img.width * containScale;
  const containHeight = img.height * containScale;
  const containX = (options.width - containWidth) / 2;
  const containY = (options.height - containHeight) / 2;
  ctx.drawImage(img, containX, containY, containWidth, containHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Failed to convert contained image to file'));
          return;
        }

        resolve(
          new File([blob], options.fileName, {
            type,
            lastModified: Date.now(),
          })
        );
      },
      type,
      quality
    );
  });
}

export function createCroppedImageFile(
  imageSrc: string,
  cropData: CropData,
  options: CroppedImageFileOptions
): Promise<File> {
  if (!imageSrc || typeof imageSrc !== 'string') {
    return Promise.reject(new Error('Invalid image source'));
  }

  if (!cropData || typeof cropData !== 'object') {
    return Promise.reject(new Error('Invalid crop data'));
  }

  if (options.width <= 0 || options.height <= 0) {
    return Promise.reject(new Error('Invalid output dimensions'));
  }

  const type = options.type ?? 'image/jpeg';
  const quality = options.quality ?? DEFAULT_QUALITY;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      try {
        canvas.width = options.width;
        canvas.height = options.height;

        ctx.drawImage(
          img,
          cropData.x,
          cropData.y,
          cropData.width,
          cropData.height,
          0,
          0,
          options.width,
          options.height
        );

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Failed to convert cropped image to file'));
              return;
            }

            resolve(
              new File([blob], options.fileName, {
                type,
                lastModified: Date.now(),
              })
            );
          },
          type,
          quality
        );
      } catch {
        reject(new Error('Failed to process image crop'));
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for cropping'));
    };

    if (imageSrc.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }

    img.src = imageSrc;
  });
}

/**
 * Generate a preview URL for a file
 */
export function createFilePreviewUrl(file: File): string {
  if (!file || !(file instanceof File)) {
    throw new Error('Invalid file: must be a File object');
  }

  const validation = validateImageFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error ?? 'Invalid image file');
  }

  try {
    return URL.createObjectURL(file);
  } catch {
    throw new Error('Failed to create preview URL');
  }
}

/**
 * Clean up preview URL
 */
export function revokePreviewUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    return;
  }

  if (url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.warn('Failed to revoke object URL:', error);
    }
  }
}

/**
 * Check if an image URL is a placeholder image
 */
export function isPlaceholderImage(url: string): boolean {
  if (!url) return true;

  // Check for common placeholder patterns
  const placeholderPatterns = [
    /placeholder/i,
    /via\.placeholder/i,
    /picsum\.photos/i,
    /unsplash\.it/i,
    /lorempixel/i,
    /dummyimage/i,
    /placehold/i,
    /example\.com/i,
    /data:image\/svg\+xml.*placeholder/i,
  ];

  return placeholderPatterns.some(pattern => pattern.test(url));
}
