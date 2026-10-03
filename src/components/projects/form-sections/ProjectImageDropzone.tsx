import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Scissors, X, Upload, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectImageDropzoneProps {
  imageUrl?: string;
  isUploading: boolean;
  uploadError?: string | null;
  selectedFileName?: string;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageRemove: () => void;
  onCropImage?: () => void;
}

const dispatchSyntheticChange = (
  file: File,
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void
) => {
  const dt = new DataTransfer();
  dt.items.add(file);
  const fakeInput = document.createElement('input');
  fakeInput.type = 'file';
  fakeInput.files = dt.files;
  onImageChange({
    target: fakeInput,
    currentTarget: fakeInput,
  } as unknown as React.ChangeEvent<HTMLInputElement>);
};

export const ProjectImageDropzone: React.FC<ProjectImageDropzoneProps> = ({
  imageUrl,
  isUploading,
  uploadError,
  selectedFileName,
  onImageChange,
  onImageRemove,
  onCropImage,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    dispatchSyntheticChange(file, onImageChange);
  };

  return (
    <div className="space-y-3">
      {imageUrl ? (
        <div
          className="bg-muted/40 relative aspect-[4/3] w-full overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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
              className="relative size-9 overflow-hidden sm:size-8"
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
                className="size-9 sm:size-8"
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
              className="size-9 sm:size-8"
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
        <label
          htmlFor="project-image-input"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'group bg-muted/20 relative flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 text-center transition-all',
            'border-border/60 hover:border-primary/60 hover:bg-muted/30',
            'focus-within:border-primary focus-within:ring-ring/50 focus-within:ring-2',
            isDragging && 'border-primary bg-primary/5 ring-primary/30 ring-2 ring-offset-2'
          )}
        >
          <div className="bg-background/60 mb-1 rounded-full p-3 shadow-sm backdrop-blur-md transition-transform group-hover:-translate-y-0.5">
            <Upload className="text-muted-foreground group-hover:text-primary size-6" />
          </div>
          <div className="text-foreground text-sm font-medium">
            Drag & drop, or{' '}
            <span className="text-primary underline-offset-4 group-hover:underline">
              choose a file
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            JPG, PNG, GIF, WebP or HEIC · up to 10MB
          </div>
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
        </label>
      )}

      {uploadError && (
        <div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
          <p className="text-destructive-text text-xs">{uploadError}</p>
        </div>
      )}
    </div>
  );
};
