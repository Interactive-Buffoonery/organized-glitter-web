import { notify } from '@/lib/notifications';
import { useState, useCallback, useEffect, useRef } from 'react';

import { useProjectImageCompression } from '@/hooks/useProjectImageCompression';
import { logger } from '@/utils/logger';
import {
  AVATAR_ORIGINAL_MAX_FILE_SIZE,
  AVATAR_PROCESSED_MAX_FILE_SIZE,
  AVATAR_RESIZE_OPTIONS,
  PROJECT_IMAGE_MAX_FILE_SIZE,
  PROGRESS_NOTE_MAX_FILE_SIZE,
} from '@/components/projects/ProgressNoteForm/constants';
import {
  hasSupportedImageExtension,
  isSupportedImageMime,
  normalizeImageFile,
} from '@/utils/image/imagePolicy';

const resizeImage = async (
  file: File,
  resizeOptions: typeof AVATAR_RESIZE_OPTIONS
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl: string | null = null;

    img.onload = () => {
      const MAX_WIDTH = resizeOptions.MAX_WIDTH;
      const MAX_HEIGHT = resizeOptions.MAX_HEIGHT;

      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
      }

      if (height > MAX_HEIGHT) {
        width = Math.round(width * (MAX_HEIGHT / height));
        height = MAX_HEIGHT;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          if (!blob) {
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
              objectUrl = null;
            }
            reject(new Error('Canvas to Blob conversion failed'));
            return;
          }

          const resizedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });

          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }

          resolve(resizedFile);
        },
        file.type,
        resizeOptions.QUALITY
      );
    };

    img.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      reject(new Error('Failed to load image'));
    };

    try {
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
    } catch (_urlError) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Failed to create image preview'));
    }
  });
};

export interface ImageUploadState {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  error: string | null;
  processedFile: File | null; // Store processed file for upload
  isReplacement: boolean; // Flag to track if this is replacing an existing image
  isCompressing: boolean; // Flag to track if image is being compressed
  compressionProgress: { percentage: number; status: string; currentStep: string } | null;
}

export const useImageUpload = (
  folder: 'project-images' | 'avatars',
  uploadContext: 'project-image' | 'progress-note' | 'avatar' = 'project-image'
) => {
  const [state, setState] = useState<ImageUploadState>({
    file: null,
    preview: null,
    uploading: false,
    error: null,
    processedFile: null,
    isReplacement: false,
    isCompressing: false,
    compressionProgress: null,
  });
  const { compressImage, isCompressing, compressionProgress } = useProjectImageCompression();
  const previewUrlRef = useRef<string | null>(null);
  const selectionVersionRef = useRef(0);
  const inputResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replacePreviewUrl = useCallback((nextPreview: string | null) => {
    const previousPreview = previewUrlRef.current;
    if (previousPreview?.startsWith('blob:') && previousPreview !== nextPreview) {
      URL.revokeObjectURL(previousPreview);
    }
    previewUrlRef.current = nextPreview;
  }, []);

  const cancelPendingInputReset = useCallback(() => {
    if (!inputResetTimerRef.current) return;
    clearTimeout(inputResetTimerRef.current);
    inputResetTimerRef.current = null;
  }, []);

  const scheduleInputReset = useCallback(
    (input: HTMLInputElement) => {
      cancelPendingInputReset();
      inputResetTimerRef.current = setTimeout(() => {
        input.value = '';
        inputResetTimerRef.current = null;
      }, 100);
    },
    [cancelPendingInputReset]
  );

  useEffect(
    () => () => {
      selectionVersionRef.current += 1;
      cancelPendingInputReset();
      replacePreviewUrl(null);
    },
    [cancelPendingInputReset, replacePreviewUrl]
  );

  // Update compression progress from the hook
  useEffect(() => {
    setState(prev => ({
      ...prev,
      isCompressing,
      compressionProgress,
    }));
  }, [isCompressing, compressionProgress]);

  const handleImageChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<File | null> => {
      logger.log('handleImageChange called in useImageUpload hook - VERSION: 2025-05-26-v2');
      logger.log(`[useImageUpload] Upload context: ${uploadContext}, folder: ${folder}`);

      // Clear input value after handling to ensure onChange fires even if same file is selected
      const input = event.target;
      cancelPendingInputReset();
      const file = input.files?.[0];
      const selectionVersion = ++selectionVersionRef.current;
      let returnFile: File | null = null;

      if (file) {
        logger.log('File selected:', { name: file.name, type: file.type, size: file.size });

        // Clear any previous errors when a new file is selected
        setState(prev => ({ ...prev, error: null }));

        if (
          !isSupportedImageMime(file.type.toLowerCase()) &&
          !hasSupportedImageExtension(file.name)
        ) {
          logger.error('Invalid file type:', file.type);
          const errorMsg = `Invalid file type "${file.type || 'unknown'}". Please select a JPG, PNG, GIF, WebP, or HEIC image.`;
          replacePreviewUrl(null);
          setState(prev => ({
            ...prev,
            error: errorMsg,
            file: null,
            preview: null,
            processedFile: null,
          }));

          notify({ kind: 'error', title: 'Invalid File Type', description: errorMsg });

          // Reset input so the same file can be selected again
          scheduleInputReset(input);

          return null;
        }

        // Check original file size against appropriate limits
        let currentMaxFileSize: number;
        let maxSizeMB: number;

        if (uploadContext === 'avatar') {
          currentMaxFileSize = AVATAR_ORIGINAL_MAX_FILE_SIZE;
          maxSizeMB = Math.round(AVATAR_ORIGINAL_MAX_FILE_SIZE / (1024 * 1024));
        } else if (uploadContext === 'project-image') {
          currentMaxFileSize = PROJECT_IMAGE_MAX_FILE_SIZE;
          maxSizeMB = Math.round(PROJECT_IMAGE_MAX_FILE_SIZE / (1024 * 1024));
        } else {
          currentMaxFileSize = PROGRESS_NOTE_MAX_FILE_SIZE;
          maxSizeMB = Math.round(PROGRESS_NOTE_MAX_FILE_SIZE / (1024 * 1024));
        }

        // Check file size with specific limits based on upload context
        logger.log(
          `[useImageUpload] File size validation - uploadContext: ${uploadContext}, file size: ${file.size}, max allowed: ${currentMaxFileSize}`
        );

        const imageType =
          uploadContext === 'avatar'
            ? 'avatar'
            : uploadContext === 'progress-note'
              ? 'progress note'
              : 'project';

        if (file.size > currentMaxFileSize) {
          const fileSizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100; // Round to 2 decimal places
          logger.error('File too large:', file.size, 'bytes (', fileSizeMB, 'MB)');
          const errorMsg = `File size is ${fileSizeMB}MB, which exceeds the ${maxSizeMB}MB upload limit for ${imageType} images.`;
          replacePreviewUrl(null);
          setState(prev => ({
            ...prev,
            error: errorMsg,
            file: null,
            preview: null,
            processedFile: null,
          }));

          notify({ kind: 'error', title: 'File Too Large', description: errorMsg });

          // Reset input so the same file can be selected again
          scheduleInputReset(input);

          return null;
        }

        const processedFile = normalizeImageFile(file);
        if (processedFile.name !== file.name || processedFile.type !== file.type) {
          logger.log('Normalized image file:', {
            originalName: file.name,
            normalizedName: processedFile.name,
            originalType: file.type || '(empty)',
            normalizedType: processedFile.type || '(empty)',
          });
        }

        // Handle avatar resizing and validation
        if (uploadContext === 'avatar') {
          logger.log('[useImageUpload] Avatar selected, processing and resizing...');

          // Set initial state with the original file
          const preview = URL.createObjectURL(file);
          replacePreviewUrl(preview);
          setState(prev => ({
            ...prev,
            file,
            preview,
            processedFile,
            error: null,
            isReplacement: true,
            isCompressing: true, // Use this flag for processing
            compressionProgress: {
              percentage: 0,
              status: 'Starting',
              currentStep: 'Resizing image...',
            },
          }));

          try {
            // Resize the avatar image
            const resizedFile = await resizeImage(processedFile, AVATAR_RESIZE_OPTIONS);
            if (selectionVersion !== selectionVersionRef.current) return null;

            // Validate the processed file size
            if (resizedFile.size > AVATAR_PROCESSED_MAX_FILE_SIZE) {
              const processedSizeMB = Math.round((resizedFile.size / (1024 * 1024)) * 100) / 100;
              const maxProcessedSizeMB = Math.round(AVATAR_PROCESSED_MAX_FILE_SIZE / (1024 * 1024));

              logger.error(
                `Processed avatar too large: ${processedSizeMB}MB exceeds ${maxProcessedSizeMB}MB limit`
              );

              replacePreviewUrl(null);
              setState(prev => ({
                ...prev,
                error: `After processing, the image is still ${processedSizeMB}MB, which exceeds the ${maxProcessedSizeMB}MB limit for avatars. Please try a different image.`,
                file: null,
                preview: null,
                processedFile: null,
                isCompressing: false,
                compressionProgress: null,
              }));

              notify({
                kind: 'error',
                title: 'Processed Image Too Large',
                description: `After processing, the image is still ${processedSizeMB}MB, which exceeds the ${maxProcessedSizeMB}MB limit for avatars. Please try a different image.`,
              });

              // Reset input
              scheduleInputReset(input);

              return null;
            }

            // Create final file with sanitized name if needed
            const finalFile =
              processedFile.name !== file.name
                ? new File([resizedFile], processedFile.name, {
                    type: resizedFile.type,
                    lastModified: resizedFile.lastModified,
                  })
                : resizedFile;

            setState(prev => ({
              ...prev,
              processedFile: finalFile,
              isCompressing: false,
              compressionProgress: {
                percentage: 100,
                status: 'Complete',
                currentStep: 'Processing complete',
              },
            }));

            returnFile = finalFile;
          } catch (resizeError) {
            if (selectionVersion !== selectionVersionRef.current) return null;
            logger.error('[useImageUpload] Avatar resize failed:', resizeError);

            setState(prev => ({
              ...prev,
              error: resizeError instanceof Error ? resizeError.message : 'Image processing failed',
              isCompressing: false,
              compressionProgress: null,
            }));

            notify({
              kind: 'error',
              title: 'Image Processing Failed',
              description: 'Unable to process avatar image. Please try a different file.',
            });

            return null;
          }
        }
        // Handle compression for project images
        else if (uploadContext === 'project-image') {
          logger.log('[useImageUpload] Project image selected, checking if compression needed');

          // Set initial state with the original file
          const preview = URL.createObjectURL(file);
          replacePreviewUrl(preview);
          setState(prev => ({
            ...prev,
            file,
            preview,
            processedFile,
            error: null,
            isReplacement: true,
            isCompressing: false,
            compressionProgress: null,
          }));

          // Compress in background if needed (> 5MB)
          if (file.size > 5 * 1024 * 1024) {
            logger.log('[useImageUpload] File size over 5MB, compressing...');

            try {
              const compressedFile = await compressImage(processedFile);
              if (selectionVersion !== selectionVersionRef.current) return null;
              logger.log('[useImageUpload] Compression completed, updating processed file');

              // Create new file with sanitized name if needed
              const finalFile =
                processedFile.name !== file.name
                  ? new File([compressedFile], processedFile.name, {
                      type: compressedFile.type,
                      lastModified: compressedFile.lastModified,
                    })
                  : compressedFile;

              setState(prev => ({
                ...prev,
                processedFile: finalFile,
              }));

              returnFile = finalFile;
            } catch (compressionError) {
              if (selectionVersion !== selectionVersionRef.current) return null;
              logger.error('[useImageUpload] Compression failed:', compressionError);

              setState(prev => ({
                ...prev,
                error:
                  compressionError instanceof Error
                    ? compressionError.message
                    : 'Compression failed',
              }));

              notify({
                kind: 'error',
                title: 'Image Compression Failed',
                description: 'Unable to optimize image. Please try a smaller file.',
              });

              return null;
            }
          } else {
            logger.log('[useImageUpload] File size under 5MB, no compression needed');
            returnFile = processedFile;
          }
        } else {
          // For non-project images, use existing logic
          const preview = URL.createObjectURL(file);
          replacePreviewUrl(preview);
          logger.log('Preview URL created:', preview);
          logger.log('Setting isReplacement flag to true for image change');
          setState(prev => ({
            ...prev,
            file,
            preview,
            processedFile,
            error: null,
            isReplacement: true,
          }));
          returnFile = processedFile;
        }
      } else {
        logger.log('No file selected from input');
      }

      // Reset input so the same file can be selected again
      scheduleInputReset(input);
      return returnFile;
    },
    [
      uploadContext,
      cancelPendingInputReset,
      compressImage,
      folder,
      replacePreviewUrl,
      scheduleInputReset,
    ]
  ); // Updated dependencies

  const handleImageRemove = useCallback(() => {
    logger.log('Image removed - setting isReplacement flag to true');
    selectionVersionRef.current += 1;
    replacePreviewUrl(null);
    setState(prev => ({
      ...prev,
      file: null,
      preview: null,
      processedFile: null,
      error: null,
      isReplacement: true, // Mark as replacement even when removing
    }));
  }, [replacePreviewUrl]);

  const applyProcessedImage = useCallback(
    (file: File) => {
      selectionVersionRef.current += 1;
      const preview = URL.createObjectURL(file);
      replacePreviewUrl(preview);

      setState(prev => ({
        ...prev,
        file,
        preview,
        processedFile: file,
        error: null,
        isReplacement: true,
        isCompressing: false,
        compressionProgress: null,
      }));
    },
    [replacePreviewUrl]
  );

  // Return state and handlers
  return {
    ...state,
    handleImageChange,
    handleImageRemove,
    applyProcessedImage,
  };
};
