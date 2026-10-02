import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/variants';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Scissors, X } from 'lucide-react';

interface CompressionProgress {
  percentage: number;
  status: string;
  currentStep: string;
}

interface ImageUploadProps {
  imageFile: File | null;
  statusText: string | null;
  isCompressing: boolean;
  compressionProgress: CompressionProgress | null;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  onCropImage?: () => void;
  error?: string; // Added error prop
}

/**
 * ImageUpload component for the ProgressNoteForm.
 * Handles image file selection, displays compression progress, and shows selected file information or errors.
 *
 * @param {ImageUploadProps} props - The component props.
 * @param {File | null} props.imageFile - The currently selected image file.
 * @param {boolean} props.isCompressing - Flag indicating if image compression is in progress.
 * @param {CompressionProgress | null} props.compressionProgress - Object detailing the compression status.
 * @param {boolean} props.disabled - Whether the input is disabled.
 * @param {(e: React.ChangeEvent<HTMLInputElement>) => void} props.onChange - Handler for image file changes.
 * @param {() => void} props.onClearImage - Handler for clearing the selected image.
 * @param {() => void} [props.onCropImage] - Handler for reopening the image cropper.
 * @param {string} [props.error] - Optional error message to display for the image input.
 * @returns {JSX.Element} The rendered ImageUpload component.
 */
export const ImageUpload: React.FC<ImageUploadProps> = ({
  imageFile,
  statusText,
  isCompressing,
  compressionProgress,
  disabled,
  onChange,
  onClearImage,
  onCropImage,
  error,
}) => {
  // Generate a unique ID for the input to connect the label and input
  const inputId = React.useId();

  // Object URL creation is a side effect, so it lives in an effect; cleanup revokes it
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!imageFile) return;

    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [imageFile]);

  // Handler to remove the selected image
  const handleRemoveImage = () => {
    onClearImage();
  };

  return (
    <div>
      <Label
        htmlFor={inputId}
        className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        Photo (optional)
      </Label>

      {/* Show upload button only when no image is selected */}
      {!imageFile && (
        <div className="mt-1.5">
          <Label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: 'default' }),
              'cursor-pointer',
              disabled && 'cursor-not-allowed opacity-50',
              error &&
                'border-destructive text-destructive-text hover:border-destructive/80 hover:text-destructive-text/80'
            )}
          >
            Choose File
          </Label>
          <Input
            id={inputId}
            type="file"
            accept="image/*"
            onChange={onChange}
            className="sr-only"
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'image-error' : undefined}
          />
        </div>
      )}

      {/* Compression Progress */}
      {isCompressing && compressionProgress && (
        <div className="mt-2 space-y-2">
          <div className="text-muted-foreground flex justify-between text-sm">
            <span>{compressionProgress.currentStep}</span>
            <span>{compressionProgress.percentage}%</span>
          </div>
          <div className="bg-muted h-2 w-full rounded-full">
            <div
              className="bg-primary h-2 rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${compressionProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Image Preview */}
      {imageFile && previewUrl && (
        <div className="mt-3">
          <div className="group relative mx-auto max-w-[200px]">
            <AspectRatio
              ratio={4 / 3}
              className="border-border bg-muted overflow-hidden rounded-lg border"
            >
              <img
                src={previewUrl}
                alt="Selected upload preview"
                className="size-full object-cover transition-transform duration-300 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
                loading="lazy"
              />
            </AspectRatio>

            {/* Remove image button */}
            {!disabled && (
              <Button
                type="button"
                size="icon"
                variant="glass-destructive"
                onClick={handleRemoveImage}
                className="absolute -top-2 -right-2 size-6 rounded-full opacity-0 shadow-md group-hover:opacity-100 focus:opacity-100"
                aria-label="Remove image"
              >
                <X />
              </Button>
            )}

            {!disabled && onCropImage && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={onCropImage}
                className="border-border bg-background/90 hover:bg-background absolute -top-2 -left-2 size-8 rounded-full shadow-md [&_svg]:size-4"
                aria-label="Crop image"
              >
                <Scissors />
              </Button>
            )}

            {isCompressing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                <div className="text-sm font-medium text-white">Compressing…</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image File Info */}
      {imageFile && !isCompressing && (
        <p className="text-muted-foreground mt-2 text-xs">
          Selected: {imageFile.name} ({Math.round((imageFile.size / (1024 * 1024)) * 100) / 100}MB)
        </p>
      )}

      <p role="status" className="sr-only">
        {statusText}
      </p>

      {error && (
        <p id="image-error" className="text-destructive-text mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
};
