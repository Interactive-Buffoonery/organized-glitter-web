import imageCompression from 'browser-image-compression';
import { hasSupportedImageExtension, isSupportedImageMime } from '@/utils/image/imagePolicy';
import { logger } from '@/utils/logger';

export interface CompressionStats {
  originalSizeMB: number;
  compressedSizeMB: number;
  compressionRatio: number;
  originalDimensions: { width: number; height: number };
  compressedDimensions: { width: number; height: number };
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export type ProgressCallback = (progress: number) => void;

export interface CompressionConfig {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  initialQuality: number;
  targetSize: number;
  maxUploadSize: number;
  warningSize: number;
  label: string;
  getAdaptiveOptions: (file: File) => {
    maxSizeMB: number;
    initialQuality: number;
    fileType: 'image/jpeg' | 'image/png';
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getCompressionSummary(stats: CompressionStats): string {
  if (stats.compressionRatio > 0) {
    return `Reduced from ${stats.originalSizeMB}MB to ${stats.compressedSizeMB}MB (${stats.compressionRatio}% smaller)`;
  }
  return `Size optimized: ${stats.compressedSizeMB}MB`;
}

export function createImageCompressor(config: CompressionConfig) {
  function validate(file: File): ValidationResult {
    const warnings: string[] = [];

    if (file.size > config.maxUploadSize) {
      const sizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;
      return {
        isValid: false,
        error: `File size (${sizeMB}MB) exceeds the ${Math.round(config.maxUploadSize / (1024 * 1024))}MB limit. Please use a smaller image.`,
      };
    }

    const isValidType = isSupportedImageMime(file.type) || hasSupportedImageExtension(file.name);

    if (!isValidType) {
      return {
        isValid: false,
        error: 'Unsupported file type. Please use JPG, PNG, WebP, or HEIC formats.',
      };
    }

    if (file.size > config.warningSize) {
      const sizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;
      warnings.push(`Large file (${sizeMB}MB) will take longer to process.`);
    }

    if (file.name.includes('#') || file.name.includes('?') || file.name.includes('%')) {
      warnings.push('File name contains special characters that may cause upload issues.');
    }

    return { isValid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  async function compress(file: File, onProgress?: ProgressCallback): Promise<File> {
    const validation = validate(file);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid file for compression');
    }

    try {
      if (onProgress) onProgress(5);

      const adaptive = config.getAdaptiveOptions(file);

      const options = {
        maxSizeMB: adaptive.maxSizeMB,
        maxWidthOrHeight: config.maxWidthOrHeight,
        useWebWorker: true,
        fileType: adaptive.fileType,
        initialQuality: adaptive.initialQuality,
        alwaysKeepResolution: false,
        preserveExif: false,
        onProgress: (progress: number) => {
          if (onProgress) onProgress(Math.round(5 + progress * 0.9));
        },
      };

      const compressedFile = await imageCompression(file, options);
      if (onProgress) onProgress(100);

      return new File([compressedFile], file.name, {
        type: compressedFile.type,
        lastModified: Date.now(),
      });
    } catch (error) {
      logger.error(`[${config.label}] Compression failed:`, error);

      if (file.size <= config.targetSize) {
        if (onProgress) onProgress(100);
        return file;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown compression error';
      throw new Error(`Image compression failed: ${errorMessage}. Please try a smaller image.`);
    }
  }

  function shouldCompress(file: File): boolean {
    return file.size > config.targetSize;
  }

  return { validate, compress, shouldCompress };
}
