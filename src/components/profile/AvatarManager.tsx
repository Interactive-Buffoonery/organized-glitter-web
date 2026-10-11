import { notify } from '@/lib/notifications';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, AlertCircle, CheckCircle } from 'lucide-react';
import imageCompression from 'browser-image-compression';

import { useBlobCleanup } from '@/hooks/useBlobCleanup';
import { resolveFileUrl } from '@/lib/pocketbase';
import { getCurrentUserId } from '@/services/auth';
import { UsersService } from '@/services/pocketbase/users.service';
import { AvatarConfig, AvatarManagerProps } from '@/types/avatar';
import ImageCropModal from './ImageCropModal';
import { logger } from '@/utils/logger';

const isIOSSafari = (): boolean => {
  const userAgent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome/.test(userAgent)
  );
};

interface UploadState {
  previewUrl?: string;
  uploadedFile?: File;
  croppedImageUrl?: string;
}

type AvatarResetKey = {
  isOpen: boolean;
  currentConfigType: AvatarConfig['type'] | undefined;
  currentAvatar: string | undefined;
};

const buildUploadState = (
  isOpen: boolean,
  currentConfigType: AvatarConfig['type'] | undefined,
  currentAvatar: string | undefined
): UploadState =>
  isOpen && currentConfigType === 'upload' && currentAvatar ? { previewUrl: currentAvatar } : {};

export function AvatarManager({
  currentAvatar,
  currentConfig,
  onAvatarUpdate,
  onClose,
  isOpen,
  userEmail: _userEmail,
}: AvatarManagerProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef<boolean>(false);
  const { createBlobUrl, revokeBlobUrl, revokeAll } = useBlobCleanup();
  const currentConfigType = currentConfig?.type;

  const [uploadState, setUploadState] = useState<UploadState>(() =>
    buildUploadState(isOpen, currentConfigType, currentAvatar)
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [finalCompressedFile, setFinalCompressedFile] = useState<File | null>(null);

  const [prevResetKey, setPrevResetKey] = useState<AvatarResetKey>({
    isOpen,
    currentConfigType,
    currentAvatar,
  });
  const nextResetKey: AvatarResetKey = { isOpen, currentConfigType, currentAvatar };
  if (
    prevResetKey.isOpen !== isOpen ||
    prevResetKey.currentConfigType !== currentConfigType ||
    prevResetKey.currentAvatar !== currentAvatar
  ) {
    setPrevResetKey(nextResetKey);
    const hasUploadDraft = isProcessing || uploadFile || finalCompressedFile || showCropModal;
    const preserveDraft = prevResetKey.isOpen && isOpen && hasUploadDraft;
    if (!preserveDraft) {
      if (isOpen) {
        setUploadState(buildUploadState(isOpen, currentConfigType, currentAvatar));
        setProcessingError(null);
        setIsProcessing(false);
        setShowCropModal(false);
      } else {
        setUploadState({});
      }
      setUploadFile(null);
      setFinalCompressedFile(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    return () => {
      revokeAll();
    };
  }, [isOpen, revokeAll]);

  const handleClose = useCallback(() => {
    revokeAll();
    onClose();
  }, [onClose, revokeAll]);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (isProcessing || isProcessingRef.current) return;
      isProcessingRef.current = true;

      setProcessingError(null);
      setIsProcessing(true);
      setFinalCompressedFile(null);

      try {
        const options = {
          maxSizeMB: 10,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          initialQuality: 0.8,
        };

        const compressedFile = await imageCompression(file, options);

        const originalExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const baseFileName = file.name.replace(/\.[^/.]+$/, '') || 'image';

        let finalExt = originalExt;
        if (
          (originalExt === 'heic' || originalExt === 'heif') &&
          compressedFile.type === 'image/jpeg'
        ) {
          finalExt = 'jpg';
        }

        const fileWithCorrectName = new File([compressedFile], `${baseFileName}.${finalExt}`, {
          type: compressedFile.type ?? file.type,
        });

        const newBlobUrl = createBlobUrl(fileWithCorrectName);

        React.startTransition(() => {
          setUploadFile(fileWithCorrectName);
          setUploadState(prev => {
            if (prev.previewUrl && prev.previewUrl.startsWith('blob:')) {
              revokeBlobUrl(prev.previewUrl);
            }
            return { ...prev, previewUrl: newBlobUrl };
          });
          setShowCropModal(true);
        });
      } catch (error) {
        logger.error('Error during initial image processing:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to process image.';

        const isHEIC =
          file.type.includes('heic') ||
          file.type.includes('heif') ||
          file.name.toLowerCase().includes('.heic') ||
          file.name.toLowerCase().includes('.heif');
        const userFriendlyMessage = isHEIC
          ? isIOSSafari()
            ? 'HEIC file processing failed on iPad. Try taking a photo in "Most Compatible" format (Settings > Camera > Formats) or use the Files app to convert to JPEG.'
            : 'HEIC file processing failed. Please try converting to JPEG first or use a different image.'
          : errorMessage;

        setProcessingError(`Processing Error: ${userFriendlyMessage}`);
        notify({
          kind: 'error',
          title: isHEIC ? 'HEIC Processing Failed' : 'Image Processing Failed',
          description: userFriendlyMessage,
        });
        setUploadFile(null);
      } finally {
        setIsProcessing(false);
        isProcessingRef.current = false;
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [isProcessing, createBlobUrl, revokeBlobUrl]
  );

  const handleCropComplete = useCallback(
    async (croppedFile: File): Promise<void> => {
      setShowCropModal(false);
      setProcessingError(null);
      setIsProcessing(true);

      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 800,
          useWebWorker: true,
          initialQuality: 0.7,
        };
        const compressedCroppedFile = await imageCompression(croppedFile, options);

        const finalFile = new File([compressedCroppedFile], `avatar-${Date.now()}.jpg`, {
          type: compressedCroppedFile.type ?? 'image/jpeg',
        });

        const newBlobUrl = createBlobUrl(finalFile);

        React.startTransition(() => {
          setFinalCompressedFile(finalFile);
          setUploadState(prev => {
            if (prev.previewUrl && prev.previewUrl.startsWith('blob:')) {
              revokeBlobUrl(prev.previewUrl);
            }
            if (prev.croppedImageUrl && prev.croppedImageUrl.startsWith('blob:')) {
              revokeBlobUrl(prev.croppedImageUrl);
            }
            return { ...prev, previewUrl: newBlobUrl, croppedImageUrl: newBlobUrl };
          });
        });
        notify({
          kind: 'info',
          title: 'Image Cropped & Compressed',
          description: 'Ready to save.',
        });
      } catch (error) {
        logger.error('Error during final image processing:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to process cropped image.';
        setProcessingError(`Processing Error: ${errorMessage}`);
        notify({ kind: 'error', title: 'Cropping/Compression Failed', description: errorMessage });
        setFinalCompressedFile(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [createBlobUrl, revokeBlobUrl]
  );

  const handleSave = useCallback(async (): Promise<void> => {
    setIsProcessing(true);
    setProcessingError(null);

    try {
      if (!finalCompressedFile) {
        setProcessingError('No image file is ready for upload.');
        notify({
          kind: 'error',
          title: 'Upload Error',
          description: 'No image file selected or processed.',
        });
        return;
      }

      const userId = getCurrentUserId();
      if (!userId) {
        throw new Error('User ID not found. Unable to upload avatar.');
      }

      const updatedUser = await UsersService.uploadAvatar(userId, finalCompressedFile);

      const uploadedUrl = updatedUser.avatar
        ? resolveFileUrl('users', updatedUser.id, updatedUser.avatar)
        : null;

      if (!uploadedUrl) {
        throw new Error('Upload completed but no avatar URL was generated.');
      }

      const avatarConfig: AvatarConfig = {
        type: 'upload',
        uploadUrl: uploadedUrl,
      };

      await onAvatarUpdate(avatarConfig);
      handleClose();
    } catch (error) {
      logger.error('Upload error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred during upload.';
      setProcessingError(`Upload Failed: ${errorMessage}`);
      notify({ kind: 'error', title: 'Upload Failed', description: errorMessage });
    } finally {
      setIsProcessing(false);
    }
  }, [finalCompressedFile, handleClose, onAvatarUpdate]);

  const handleRemoveAvatar = useCallback(async (): Promise<void> => {
    const avatarConfig: AvatarConfig = { type: 'initials' };
    await onAvatarUpdate(avatarConfig);
    handleClose();
  }, [handleClose, onAvatarUpdate]);

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="sm:max-w-[525px] md:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Manage Your Avatar</DialogTitle>
          <DialogDescription>
            Upload and manage your profile avatar. You can upload an image, crop it to fit, and save
            it to your profile.
          </DialogDescription>
        </DialogHeader>

        {/* Preview Section */}
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 items-center gap-4">
            <Label htmlFor="avatar-preview" className="sr-only text-center">
              Avatar Preview
            </Label>
            <div className="col-span-1 flex min-h-[160px] min-w-[160px] items-center justify-center rounded-md border border-dashed p-4">
              {isProcessing && <Loader2 className="text-primary size-12 animate-spin" />}

              {!isProcessing && uploadState.previewUrl && (
                <div className="border-border bg-muted size-32 overflow-hidden rounded-full border-2">
                  <PrivateFileImage
                    key={uploadState.previewUrl}
                    src={uploadState.previewUrl}
                    alt="Avatar preview"
                    className="size-full object-cover"
                    onError={() => {
                      setUploadState(prev => ({ ...prev, previewUrl: undefined }));
                    }}
                  />
                </div>
              )}

              {!isProcessing && !uploadState.previewUrl && (
                <div className="text-muted-foreground text-center">
                  <UploadCloud className="mx-auto size-12" />
                  <p>Upload an image to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="space-y-4 rounded-md border p-4 text-center">
          <div>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || showCropModal}
            >
              {isProcessing && !showCropModal ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-2 size-4" />
              )}
              Choose Image
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept={
                isIOSSafari()
                  ? 'image/png, image/jpeg, image/webp, image/gif'
                  : 'image/png, image/jpeg, image/webp, image/gif, image/heic, image/heif'
              }
              style={{ display: 'none' }}
              disabled={isProcessing || showCropModal}
            />

            <p className="text-muted-foreground mt-2 text-xs">
              Max file size: 50MB. JPG, PNG, GIF, WEBP{isIOSSafari() ? '' : ', HEIC'}.
            </p>
          </div>

          {uploadState.previewUrl && !showCropModal && uploadFile && (
            <Button
              type="button"
              onClick={() => setShowCropModal(true)}
              variant="outline"
              disabled={isProcessing}
            >
              Crop Image
            </Button>
          )}

          {currentConfig?.type === 'upload' && (
            <Button
              type="button"
              onClick={handleRemoveAvatar}
              variant="outline"
              disabled={isProcessing}
            >
              Remove Avatar
            </Button>
          )}
        </div>

        {/* Error Display */}
        {processingError && (
          <div className="border-destructive/50 bg-destructive/10 text-destructive-text mt-4 flex items-center rounded-md border p-3 text-sm">
            <AlertCircle className="mr-2 size-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Error</p>
              <p>{processingError}</p>
            </div>
          </div>
        )}

        {/* Success Display */}
        {finalCompressedFile && !processingError && (
          <Alert variant="success" className="mt-4">
            <CheckCircle className="size-5" />
            <AlertDescription>Image processed and ready! See preview above</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !finalCompressedFile || !!processingError}
          >
            {isProcessing && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Avatar
          </Button>
        </DialogFooter>
      </DialogContent>

      {showCropModal && uploadFile && (
        <ImageCropModal
          file={uploadFile}
          imageUrl={uploadState.previewUrl}
          onCropComplete={handleCropComplete}
          onCancel={() => setShowCropModal(false)}
        />
      )}
    </Dialog>
  );
}
