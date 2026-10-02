import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import type { ChangeEvent } from 'react';
import { BookOpen, X } from 'lucide-react';
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
  return (
    <Section label="Cover image" flush="lg">
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
                className="absolute top-2 right-2"
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
                'w-full cursor-pointer justify-center',
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
            className={
              isSubmitting
                ? 'bg-muted/20 flex aspect-[3/4] cursor-not-allowed flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center opacity-60'
                : 'bg-muted/20 hover:border-primary/60 flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center'
            }
          >
            <BookOpen className="text-muted-foreground size-10" />
            <span className="text-sm font-medium">Choose cover image</span>
            <span className="text-muted-foreground text-xs">JPG, PNG, WebP, GIF or HEIC</span>
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
