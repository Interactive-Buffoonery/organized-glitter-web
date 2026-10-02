import { notify } from '@/lib/notifications';
import { useRef, useState } from 'react';
import { compressProjectImage } from '@/utils/image/projectImageCompression';

import { logger } from '@/utils/logger';

/**
 * @interface CompressionProgress
 * @description Interface for tracking the progress of image compression.
 */
interface CompressionProgress {
  percentage: number;
  status: string;
  currentStep: string;
}

/**
 * Custom hook for handling project image compression with progress tracking and user feedback.
 * Similar to useProgressImageCompression but optimized for project images with higher quality settings.
 * @returns {Object} An object containing the `compressImage` function, compression state, and a reset function.
 */
export const useProjectImageCompression = () => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<CompressionProgress | null>(null);
  const compressionVersionRef = useRef(0);

  /**
   * Compresses a project image file if it exceeds the target threshold.
   * Provides progress updates and user notifications.
   * @param {File} file - The image file to compress.
   * @returns {Promise<File>} A promise that resolves to the compressed file, or the original file if compression is skipped.
   * @throws {Error} If the file exceeds the maximum allowed size (50MB).
   */
  const compressImage = async (file: File): Promise<File> => {
    const compressionVersion = ++compressionVersionRef.current;
    const isCurrentCompression = () => compressionVersion === compressionVersionRef.current;
    const maxSize = 50 * 1024 * 1024; // 50MB
    const compressionThreshold = 5 * 1024 * 1024; // 5MB - compress anything larger

    // Check file size limit
    if (file.size > maxSize) {
      setIsCompressing(false);
      setCompressionProgress(null);
      const fileSizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;
      notify({
        kind: 'error',
        title: 'File Too Large',
        description: `Image is ${fileSizeMB}MB, which exceeds the 50MB limit for project images. Please use a smaller image.`,
      });
      throw new Error(`File too large: ${fileSizeMB}MB exceeds 50MB limit`);
    }

    // Return original file if its size is at or below the 5MB compression threshold
    if (file.size <= compressionThreshold) {
      setIsCompressing(false);
      setCompressionProgress(null);
      logger.log(
        `[useProjectImageCompression] File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) is under threshold, using original`
      );
      return file;
    }

    // Compress the image
    try {
      setIsCompressing(true);
      logger.log(`[useProjectImageCompression] Starting compression for ${file.name}`);

      const compressedFile = await compressProjectImage(file, (progress: number) => {
        if (!isCurrentCompression()) return;
        setCompressionProgress({
          percentage: progress,
          status: progress < 100 ? 'Compressing...' : 'Complete',
          currentStep:
            progress < 50
              ? 'Analyzing image...'
              : progress < 90
                ? 'Compressing...'
                : 'Finalizing...',
        });
      });

      const originalSizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;
      const compressedSizeMB = Math.round((compressedFile.size / (1024 * 1024)) * 100) / 100;
      const compressionRatio = Math.round((1 - compressedFile.size / file.size) * 100);

      logger.log(`[useProjectImageCompression] Compression successful:`, {
        original: `${originalSizeMB}MB`,
        compressed: `${compressedSizeMB}MB`,
        ratio: `${compressionRatio}%`,
      });

      // Show simplified upload success toast
      if (isCurrentCompression()) {
        notify({
          kind: 'info',
          title: 'Image Uploaded',
          description: 'Image is successfully uploaded!',
        });
      }

      return compressedFile;
    } catch (error) {
      logger.error('[useProjectImageCompression] Compression failed:', error);

      if (isCurrentCompression()) {
        notify({
          kind: 'error',
          title: 'Compression Failed',
          description: 'Unable to optimize image. Using original file.',
        });
      }

      // Fall back to original file if compression fails and it's under the Supabase limit
      if (file.size <= 6 * 1024 * 1024) {
        // 6MB fallback limit
        logger.log('[useProjectImageCompression] Using original file as fallback (under 6MB)');
        return file;
      }

      // If file is too large and compression failed, throw error
      throw new Error(
        `Image compression failed and file is too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Please use a smaller image.`
      );
    } finally {
      if (isCurrentCompression()) {
        setIsCompressing(false);
        setCompressionProgress(null);
      }
    }
  };

  /**
   * Resets the compression state (isCompressing and compressionProgress).
   */
  const resetCompressionState = () => {
    compressionVersionRef.current += 1;
    setIsCompressing(false);
    setCompressionProgress(null);
  };

  return {
    compressImage,
    isCompressing,
    compressionProgress,
    resetCompressionState,
  };
};
