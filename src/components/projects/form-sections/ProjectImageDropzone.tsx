import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Scissors, X, RefreshCw } from 'lucide-react';
import { CoverDropzone } from '@/components/image/CoverDropzone';
import { dispatchSyntheticChange } from './dispatchSyntheticChange';

interface ProjectImageDropzoneProps {
  imageUrl?: string;
  isUploading: boolean;
  uploadError?: string | null;
  selectedFileName?: string;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageRemove: () => void;
  onCropImage?: () => void;
}

export const ProjectImageDropzone: React.FC<ProjectImageDropzoneProps> = ({
  imageUrl,
  isUploading,
  uploadError,
  selectedFileName,
  onImageChange,
  onImageRemove,
  onCropImage,
}) => {
  const handleFile = (file: File) => dispatchSyntheticChange(file, onImageChange);

  const handleDropReplace = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && !isUploading) handleFile(file);
  };

  return (
    <div className="space-y-3">
      {imageUrl ? (
        <div
          className="bg-muted/40 relative aspect-[4/3] w-full overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDropReplace}
        >
          <PrivateFileImage
            src={imageUrl}
            fallbackSrc="https://placehold.co/1200x900/f1f5f9/64748b?text=Error"
            alt="Project preview"
            className="size-full object-cover"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 via-black/10 to-transparent"
          />

          <div className="absolute top-3 right-3 flex gap-2">
            <Button
              type="button"
              variant="glass"
              size="icon-sm"
              disabled={isUploading}
              aria-label="Replace image"
              className="relative size-11 overflow-hidden"
            >
              <RefreshCw />
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                onChange={onImageChange}
                disabled={isUploading}
                aria-label="Replace image file picker"
              />
            </Button>
            {onCropImage && (
              <Button
                type="button"
                variant="glass"
                size="icon-sm"
                disabled={isUploading}
                onClick={onCropImage}
                aria-label="Crop image"
                className="size-11"
              >
                <Scissors />
              </Button>
            )}
            <Button
              type="button"
              variant="glass-destructive"
              size="icon-sm"
              disabled={isUploading}
              onClick={onImageRemove}
              aria-label="Remove image"
              className="size-11"
            >
              <X />
            </Button>
          </div>

          {selectedFileName && (
            <div className="absolute right-3 bottom-3 left-3 truncate rounded-md bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-md">
              {selectedFileName}
            </div>
          )}

          {isUploading && (
            <div className="bg-background/70 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
                <span className="text-sm font-medium">Uploading…</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <CoverDropzone
          htmlFor="project-image-input"
          onFile={handleFile}
          disabled={isUploading}
          className="aspect-[4/3]"
        >
          <input
            id="project-image-input"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onImageChange}
            disabled={isUploading}
          />

          {isUploading && (
            <div className="bg-background/70 absolute inset-0 flex items-center justify-center rounded-xl backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
                <span className="text-sm font-medium">Uploading…</span>
              </div>
            </div>
          )}
        </CoverDropzone>
      )}

      {uploadError && (
        <div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
          <p className="text-destructive-text text-xs">{uploadError}</p>
        </div>
      )}
    </div>
  );
};
