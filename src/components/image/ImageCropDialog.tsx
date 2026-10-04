import { useCallback, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { createContainedImageFile, createCroppedImageFile } from '@/utils/image/imageUtils';
import type { CropPreset } from '@/utils/image/imagePolicy';
import { useImageCropSession } from './useImageCropSession';

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  title: string;
  description: string;
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  outputType?: string;
  presets?: CropPreset[];
  defaultPresetId?: string;
  onOpenChange: (open: boolean) => void;
  onCropComplete: (file: File) => void;
  onUseOriginal: (file: File) => void;
  onAfterClose?: () => void;
}

type CropDialogResetKey = {
  activeFileKey: string | null;
  presetsResetKey: string;
  defaultPresetId: string | undefined;
};

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

const getExtensionForMimeType = (outputType: string): string => {
  const normalized = outputType.toLowerCase().trim();
  if (MIME_TYPE_EXTENSIONS[normalized]) {
    return MIME_TYPE_EXTENSIONS[normalized];
  }

  const subtypeMatch = /^image\/([a-z0-9.+-]+)$/.exec(normalized);
  if (subtypeMatch) {
    return subtypeMatch[1].replace(/^x-/, '');
  }

  return 'jpg';
};

const buildCroppedFileName = (fileName: string, outputType: string): string => {
  const baseName = fileName.replace(/\.[^/.]+$/, '') || 'image';
  const extension = getExtensionForMimeType(outputType);

  return `${baseName}-cropped.${extension}`;
};

const buildPresetsResetKey = (presets: CropPreset[] | undefined): string =>
  presets
    ?.map(
      preset =>
        `${preset.id}:${preset.aspect}:${preset.outputWidth}:${preset.outputHeight}:${preset.mode ?? 'crop'}`
    )
    .join('|') ?? '';

const buildFileResetKey = (file: File | null): string | null =>
  file ? `${file.name}:${file.size}:${file.type}:${file.lastModified}` : null;

export function ImageCropDialog({
  open,
  file,
  title,
  description,
  aspect,
  outputWidth,
  outputHeight,
  outputType = 'image/jpeg',
  presets,
  defaultPresetId,
  onOpenChange,
  onCropComplete,
  onUseOriginal,
  onAfterClose,
}: ImageCropDialogProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    defaultPresetId ?? presets?.[0]?.id ?? null
  );

  const activeFile = open ? file : null;
  const activeFileKey = buildFileResetKey(activeFile);
  const presetsResetKey = buildPresetsResetKey(presets);
  const {
    imageSrc,
    crop,
    setCrop,
    zoom,
    setZoom,
    cropData,
    setCropData,
    isProcessing,
    resetCrop,
    processImage,
    invalidate,
  } = useImageCropSession({
    file: activeFile,
    onPreviewError: () => onOpenChange(false),
    resetKey: JSON.stringify([activeFileKey, presetsResetKey, defaultPresetId]),
  });
  const [prevResetKey, setPrevResetKey] = useState<CropDialogResetKey>({
    activeFileKey,
    presetsResetKey,
    defaultPresetId,
  });
  const nextResetKey: CropDialogResetKey = { activeFileKey, presetsResetKey, defaultPresetId };
  if (
    prevResetKey.activeFileKey !== activeFileKey ||
    prevResetKey.presetsResetKey !== presetsResetKey ||
    prevResetKey.defaultPresetId !== defaultPresetId
  ) {
    setPrevResetKey(nextResetKey);
    setSelectedPresetId(defaultPresetId ?? presets?.[0]?.id ?? null);
  }

  const selectedPreset = useMemo(
    () => presets?.find(preset => preset.id === selectedPresetId) ?? presets?.[0],
    [presets, selectedPresetId]
  );
  const activeAspect = selectedPreset?.aspect ?? aspect;
  const activeOutputWidth = selectedPreset?.outputWidth ?? outputWidth;
  const activeOutputHeight = selectedPreset?.outputHeight ?? outputHeight;
  const activeMode = selectedPreset?.mode ?? 'crop';

  const outputLabel = useMemo(() => {
    if (selectedPreset) return selectedPreset.label;
    if (activeAspect === 1) return 'Square';
    if (activeAspect === 4 / 3) return '4:3';
    if (activeAspect === 3 / 4) return '3:4';
    return 'Fixed crop';
  }, [activeAspect, selectedPreset]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) invalidate();
      onOpenChange(nextOpen);
    },
    [invalidate, onOpenChange]
  );

  const handleUseOriginal = useCallback(() => {
    if (!file) return;

    onUseOriginal(file);
    handleOpenChange(false);
  }, [file, handleOpenChange, onUseOriginal]);

  const handleCropConfirm = useCallback(async () => {
    if (!file || !imageSrc || (activeMode === 'crop' && !cropData)) return;

    await processImage(
      async (source, pixels) => {
        const fileName = buildCroppedFileName(file.name, outputType);
        return activeMode === 'contain'
          ? createContainedImageFile(source, {
              fileName,
              width: activeOutputWidth,
              height: activeOutputHeight,
              type: outputType,
              quality: 0.9,
            })
          : createCroppedImageFile(source, pixels!, {
              fileName,
              width: activeOutputWidth,
              height: activeOutputHeight,
              type: outputType,
              quality: 0.9,
            });
      },
      processedFile => {
        onCropComplete(processedFile);
        handleOpenChange(false);
      },
      'Image Processing Error',
      'Failed to process image.'
    );
  }, [
    activeMode,
    cropData,
    file,
    imageSrc,
    onCropComplete,
    handleOpenChange,
    activeOutputHeight,
    activeOutputWidth,
    outputType,
    processImage,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[min(760px,92dvh)] sm:max-w-3xl sm:rounded-lg sm:border"
        onCloseAutoFocus={onAfterClose}
      >
        <DialogHeader className="border-border shrink-0 border-b px-5 py-4 pr-14 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          <div className="text-muted-foreground flex items-center justify-between gap-3 text-sm">
            <span>{outputLabel}</span>
            <span>
              {activeOutputWidth} x {activeOutputHeight}
            </span>
          </div>

          <div className="bg-muted relative h-[min(38dvh,340px)] min-h-[260px] shrink-0 overflow-hidden rounded-md sm:h-[min(42dvh,340px)]">
            {imageSrc && activeMode === 'crop' && (
              <Cropper
                key={activeAspect}
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={activeAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_croppedArea, croppedAreaPixels) => setCropData(croppedAreaPixels)}
                showGrid={false}
              />
            )}
            {imageSrc && activeMode === 'contain' && (
              <div className="bg-muted flex h-full items-center justify-center p-4">
                <img
                  src={imageSrc}
                  alt="Full-size preview"
                  className="max-h-full max-w-full object-contain shadow-lg"
                />
              </div>
            )}
          </div>

          {presets && presets.length > 1 && (
            <div className="space-y-2">
              <Label>Crop shape</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {presets.map(preset => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={preset.id === selectedPresetId ? 'default' : 'outline'}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      resetCrop();
                      setCropData(
                        preset.mode === 'contain' ? { x: 0, y: 0, width: 1, height: 1 } : null
                      );
                    }}
                    disabled={isProcessing}
                    className="h-auto min-h-12 flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                  >
                    <span>{preset.label}</span>
                    {preset.description && (
                      <span className="text-xs font-normal opacity-80">{preset.description}</span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {activeMode === 'crop' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="image-crop-zoom">Zoom</Label>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {zoom.toFixed(1)}x
                </span>
              </div>
              <input
                id="image-crop-zoom"
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={event => setZoom(Number(event.target.value))}
                className="accent-primary h-10 w-full cursor-pointer"
              />
            </div>
          )}
        </div>

        <DialogFooter className="border-border shrink-0 gap-2 border-t p-4 sm:p-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleUseOriginal}
            disabled={!file || isProcessing}
          >
            Skip crop
          </Button>
          <Button
            type="button"
            onClick={handleCropConfirm}
            disabled={(activeMode === 'crop' && !cropData) || isProcessing}
          >
            {isProcessing
              ? 'Processing...'
              : activeMode === 'contain'
                ? 'Use fitted image'
                : 'Use crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
