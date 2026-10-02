import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notifications';
import { createFilePreviewUrl, revokePreviewUrl } from '@/utils/image/imageUtils';
import type { CropData } from '@/utils/image/imageUtils';
import { logger } from '@/utils/logger';

interface ImageCropSessionOptions {
  file: File | null;
  externalUrl?: string | null;
  onPreviewError?: () => void;
  resetKey?: string;
}

export function useImageCropSession({
  file,
  externalUrl,
  onPreviewError,
  resetKey,
}: ImageCropSessionOptions) {
  const [imageSrc, setImageSrc] = useState<string | null>(externalUrl ?? null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropData, setCropData] = useState<CropData | null>(null);
  const [processingGeneration, setProcessingGeneration] = useState<number | null>(null);
  const isProcessing = processingGeneration !== null;
  const generationRef = useRef(0);
  const processingRef = useRef(false);
  const onPreviewErrorRef = useRef(onPreviewError);
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropData(null);
  }

  useEffect(() => {
    onPreviewErrorRef.current = onPreviewError;
  }, [onPreviewError]);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    processingRef.current = false;
    setProcessingGeneration(null);
  }, []);

  useEffect(() => {
    invalidate();
  }, [resetKey, invalidate]);

  const resetCrop = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropData(null);
  }, []);

  useEffect(() => {
    invalidate();
    if (externalUrl) {
      setImageSrc(externalUrl);
      return () => {
        generationRef.current += 1;
      };
    }
    if (!file) {
      setImageSrc(null);
      return () => {
        generationRef.current += 1;
      };
    }

    let previewUrl: string;
    try {
      previewUrl = createFilePreviewUrl(file);
      setImageSrc(previewUrl);
    } catch (error) {
      logger.error('Error creating crop preview:', error);
      notify({
        kind: 'error',
        title: 'Image Error',
        description: error instanceof Error ? error.message : 'Could not preview this image.',
      });
      onPreviewErrorRef.current?.();
      return () => {
        generationRef.current += 1;
      };
    }
    return () => {
      generationRef.current += 1;
      revokePreviewUrl(previewUrl);
    };
  }, [file, externalUrl, invalidate]);

  const processImage = useCallback(
    async (
      process: (imageSrc: string, cropData: CropData | null) => Promise<File>,
      onComplete: (file: File) => void,
      errorTitle: string,
      fallbackError: string
    ) => {
      if (!imageSrc || processingRef.current) return;
      const generation = generationRef.current;
      processingRef.current = true;
      setProcessingGeneration(generation);
      try {
        const result = await process(imageSrc, cropData);
        if (generation === generationRef.current) onComplete(result);
      } catch (error) {
        if (generation === generationRef.current) {
          logger.error('Error processing image:', error);
          notify({
            kind: 'error',
            title: errorTitle,
            description: error instanceof Error ? error.message : fallbackError,
          });
        }
      } finally {
        if (generation === generationRef.current) {
          processingRef.current = false;
          setProcessingGeneration(null);
        }
      }
    },
    [imageSrc, cropData]
  );

  return {
    imageSrc,
    crop,
    setCrop,
    zoom,
    setZoom,
    cropData,
    setCropData,
    isProcessing,
    resetCrop,
    invalidate,
    processImage,
  };
}
