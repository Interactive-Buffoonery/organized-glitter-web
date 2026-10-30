import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { dispatchSyntheticChange } from '@/components/projects/form-sections/dispatchSyntheticChange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buttonVariants } from '@/components/ui/variants';
import { cn } from '@/lib/utils';
import { Section } from './ColoringBookFormPrimitives';

interface ColoringBookCoverPanelProps {
  previewUrl: string;
  isSubmitting: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
}

export function ColoringBookCoverPanel({
  previewUrl,
  isSubmitting,
  onFileChange,
  onRemoveImage,
}: ColoringBookCoverPanelProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!isSubmitting) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || isSubmitting) return;
    dispatchSyntheticChange(file, onFileChange);
  };

  return (
    <Section label="Cover" flush="lg">
      <div className="space-y-2">
        <Label htmlFor="coloring-cover" className="sr-only">
          Cover image
        </Label>
        {previewUrl ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border">
              <PrivateFileImage
                src={previewUrl}
                alt=""
                className="aspect-[3/4] w-full object-cover"
              />
              <Button
                type="button"
                variant="glass-destructive"
                size="icon-sm"
                className="absolute top-2 right-2 size-11"
                onClick={onRemoveImage}
                disabled={isSubmitting}
                aria-label="Remove cover image"
              >
                <X className="size-4" />
              </Button>
            </div>
            <Label
              htmlFor="coloring-cover"
              aria-disabled={isSubmitting}
              className={cn(
                buttonVariants({ variant: 'glass', size: 'sm' }),
                'min-h-11 w-full cursor-pointer justify-center',
                isSubmitting && 'pointer-events-none opacity-60'
              )}
            >
              Replace cover image
            </Label>
          </div>
        ) : (
          <label
            htmlFor="coloring-cover"
            aria-disabled={isSubmitting}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'group bg-muted/20 flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-all',
              'border-border/60 hover:border-primary/60 hover:bg-muted/30',
              'focus-within:border-primary focus-within:ring-ring/50 focus-within:ring-2',
              isDragging && 'border-primary bg-primary/5 ring-primary/30 ring-2 ring-offset-2',
              isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            )}
          >
            <div className="bg-background/60 mb-1 rounded-full p-3 shadow-sm backdrop-blur-md transition-transform group-hover:-translate-y-0.5">
              <Upload className="text-muted-foreground group-hover:text-primary size-6" />
            </div>
            <span className="text-foreground text-sm font-medium">
              Drag & drop, or{' '}
              <span className="text-primary underline-offset-4 group-hover:underline">
                choose a file
              </span>
            </span>
            <span className="text-muted-foreground text-xs">JPG, PNG, GIF, WebP or HEIC</span>
          </label>
        )}
        <Input
          id="coloring-cover"
          type="file"
          accept="image/*"
          onChange={onFileChange}
          disabled={isSubmitting}
          className="sr-only !h-px !w-px !border-0 !p-0"
        />
      </div>
    </Section>
  );
}
