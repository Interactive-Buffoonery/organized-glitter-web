import { notify } from '@/lib/notifications';
import React, { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CropModalProps } from '@/types/avatar';
import { validateImageFile, createCroppedImageFile } from '@/utils/image/imageUtils';

import { useImageCropSession } from '@/components/image/useImageCropSession';

const ImageCropModal: React.FC<CropModalProps> = ({
  file: initialFileFromProps,
  imageUrl: providedImageUrl,
  onCropComplete,
  onCancel,
}) => {
  const [file, setFile] = useState<File | null>(initialFileFromProps);
  const [usesProvidedImage, setUsesProvidedImage] = useState(true);
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
    invalidate,
    processImage,
  } = useImageCropSession({
    file,
    externalUrl: usesProvidedImage ? providedImageUrl : null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      const validation = validateImageFile(selectedFile);

      if (!validation.isValid) {
        notify({
          kind: 'error',

          title: 'Invalid File',
          description: validation.error,
        });
        return;
      }

      invalidate();
      setUsesProvidedImage(false);
      setFile(selectedFile);
      resetCrop();
    },
    [invalidate, resetCrop]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect]
  );

  const handleCropChange = useCallback(
    (crop: { x: number; y: number }) => {
      setCrop(crop);
    },
    [setCrop]
  );

  const handleZoomChange = useCallback(
    (zoom: number) => {
      setZoom(zoom);
    },
    [setZoom]
  );

  const handleCropAreaChange = useCallback(
    (_area: unknown, pixels: { x: number; y: number; width: number; height: number }) => {
      setCropData(pixels);
    },
    [setCropData]
  );

  const handleCropConfirm = useCallback(async () => {
    if (!file || !cropData || !imageSrc) return;
    await processImage(
      async (source, pixels) => {
        const baseFileName = file.name.replace(/\.[^/.]+$/, '') || 'image';
        return createCroppedImageFile(source, pixels!, {
          fileName: `cropped-${baseFileName}.jpg`,
          width: 200,
          height: 200,
          type: 'image/jpeg',
          quality: 0.9,
        });
      },
      onCropComplete,
      'Cropping Error',
      'Failed to crop image'
    );
  }, [file, cropData, imageSrc, onCropComplete, processImage]);

  const handleCancel = useCallback(() => {
    invalidate();
    onCancel();
  }, [invalidate, onCancel]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  return (
    <Dialog
      open={true}
      onOpenChange={openStatus => {
        if (!openStatus) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Crop Your Photo</DialogTitle>
          <DialogDescription>
            Upload an image and adjust the crop area to create your avatar. You can drag to
            reposition and use the zoom slider to resize.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {!imageSrc ? (
            // File upload area
            <div
              role="button"
              tabIndex={0}
              className="border-muted-foreground/25 hover:border-muted-foreground/50 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <Upload className="text-muted-foreground mx-auto mb-4 size-12" />
              <h3 className="mb-2 text-lg font-medium">Upload Your Photo</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                Drag and drop an image, or click to browse
              </p>
              <p className="text-muted-foreground text-xs">
                Supports JPEG, PNG, WebP, HEIC • Max 5MB
              </p>

              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          ) : (
            // Crop interface
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-lg font-medium">Adjust Crop</div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    invalidate();
                    setUsesProvidedImage(false);
                    setFile(null);
                    resetCrop();
                  }}
                >
                  <X className="mr-1 size-4" /> Change Photo
                </Button>
              </div>

              <div
                className="bg-muted relative overflow-hidden rounded-lg"
                style={{ height: '300px' }}
              >
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={handleCropChange}
                  onZoomChange={handleZoomChange}
                  onCropAreaChange={handleCropAreaChange}
                  showGrid={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zoom">Zoom</Label>
                <input
                  id="zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setZoom(Number(e.target.value));
                  }}
                  className="bg-muted h-2 w-full cursor-pointer rounded-lg"
                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleCropConfirm} disabled={!cropData || isProcessing || !imageSrc}>
            {isProcessing ? 'Processing...' : 'Crop & Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropModal;
