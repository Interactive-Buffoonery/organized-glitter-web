import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import type { ChangeEvent } from 'react';
import { X } from 'lucide-react';
import { CoverDropzone } from '@/components/image/CoverDropzone';
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
          <CoverDropzone
            htmlFor="coloring-cover"
            onFile={file => dispatchSyntheticChange(file, onFileChange)}
            disabled={isSubmitting}
            className="aspect-[3/4] px-4"
          />
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
