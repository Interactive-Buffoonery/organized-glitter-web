import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { useRef } from 'react';
import type { ChangeEvent, Ref } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { ColoringPageProgressNotes } from '@/components/coloring/ColoringPageProgressNotes';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import type { ProgressNoteDialogTarget } from '@/components/projects/ProgressNoteDialog';
import { Section, SectionHeading } from '@/components/shared/Section';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/variants';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { COLORING_PAGE_PHOTO_CROP_PRESETS } from '@/utils/image/imagePolicy';

interface ColoringPagePhotoSectionProps {
  page: ColoringPageDTO;
  pagePhotoUrls: string[];
  leadPhotoUrl: string | undefined;
  progressNoteTarget?: ProgressNoteDialogTarget;
  disabled: boolean;
  photoCropFile: File | null;
  isPhotoCropDialogOpen: boolean;
  onPhotoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPhotoCropDialogOpenChange: (open: boolean) => void;
  onPhotoCropComplete: (file: File) => void;
  onPhotoUseOriginal: (file: File) => void;
  onSetMainPhoto: (filename: string) => void;
  onPhotoDelete: (filename: string) => void;
}

interface PagePhotoUploadInputProps {
  ref?: Ref<HTMLInputElement>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

function PagePhotoUploadInput({ ref, onChange, disabled }: PagePhotoUploadInputProps) {
  return (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={onChange}
      aria-label="Add page photos"
      disabled={disabled}
      tabIndex={-1}
    />
  );
}

export function ColoringPagePhotoSection({
  page,
  pagePhotoUrls,
  leadPhotoUrl,
  progressNoteTarget,
  disabled,
  photoCropFile,
  isPhotoCropDialogOpen,
  onPhotoUpload,
  onPhotoCropDialogOpenChange,
  onPhotoCropComplete,
  onPhotoUseOriginal,
  onSetMainPhoto,
  onPhotoDelete,
}: ColoringPagePhotoSectionProps) {
  const emptyUploadInputRef = useRef<HTMLInputElement>(null);
  const manageUploadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <ImageCropDialog
        open={isPhotoCropDialogOpen}
        file={photoCropFile}
        title="Frame coloring page photo"
        description="Fit the whole page by default, or choose a crop for detail photos."
        aspect={3 / 4}
        outputWidth={900}
        outputHeight={1200}
        presets={COLORING_PAGE_PHOTO_CROP_PRESETS}
        defaultPresetId="fit-page-3-4"
        onOpenChange={onPhotoCropDialogOpenChange}
        onCropComplete={onPhotoCropComplete}
        onUseOriginal={onPhotoUseOriginal}
      />

      <Section landmark={false}>
        <div className="bg-muted/30 overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_hsl(var(--glass-highlight))]">
          {leadPhotoUrl ? (
            <PrivateFileImage
              src={leadPhotoUrl}
              alt={`Page ${page.pageNumber} lead artwork`}
              className="mx-auto aspect-[3/4] max-h-[72vh] w-full max-w-3xl object-contain"
            />
          ) : (
            <div className="feat-paper flex aspect-[3/4] max-h-[72vh] min-h-[24rem] w-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-muted-foreground text-sm">No photo yet</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => emptyUploadInputRef.current?.click()}
                disabled={disabled}
              >
                <ImagePlus className="mr-2 size-4" aria-hidden="true" />
                Add a photo
              </Button>
              <PagePhotoUploadInput
                ref={emptyUploadInputRef}
                onChange={onPhotoUpload}
                disabled={disabled}
              />
            </div>
          )}
        </div>

        {pagePhotoUrls.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Page photo thumbnails">
            {pagePhotoUrls.map((url, index) => (
              <PrivateFileImage
                key={page.photos[index]}
                src={url}
                alt={`Page ${page.pageNumber} thumbnail ${index + 1}`}
                className="h-20 w-16 shrink-0 rounded-md object-cover"
              />
            ))}
          </div>
        ) : null}
      </Section>

      {pagePhotoUrls.length > 0 ? (
        <Section className="space-y-4" landmark={false}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeading>Manage photos</SectionHeading>
            <Button
              type="button"
              variant="ghost"
              onClick={() => manageUploadInputRef.current?.click()}
              disabled={disabled}
            >
              <ImagePlus className="mr-2 size-4" aria-hidden="true" />
              Add photos
            </Button>
            <PagePhotoUploadInput
              ref={manageUploadInputRef}
              onChange={onPhotoUpload}
              disabled={disabled}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pagePhotoUrls.map((url, index) => {
              const filename = page.photos[index];
              const isMainImage = index === 0;

              return (
                <div
                  key={filename}
                  className="border-border/60 bg-background/40 space-y-3 rounded-lg border p-2"
                >
                  <div className="relative overflow-hidden rounded-md">
                    <PrivateFileImage
                      src={url}
                      alt={`Page ${page.pageNumber} attachment ${index + 1}`}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                    {isMainImage ? (
                      <span className="bg-background/85 text-foreground absolute top-2 left-2 rounded-md px-2 py-1 text-xs font-medium shadow-sm">
                        Main image
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    {isMainImage ? (
                      <span className="text-muted-foreground text-sm">Shown above</span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSetMainPhoto(filename)}
                        disabled={disabled}
                        aria-label={`Set photo ${index + 1} as main image`}
                      >
                        Set as main
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive-text sm:ml-auto"
                          aria-label={`Delete photo ${index + 1}`}
                        >
                          <Trash2 className="mr-2 size-4" aria-hidden="true" />
                          Delete photo
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the photo from this coloring page.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className={buttonVariants({ variant: 'destructive' })}
                            onClick={() => onPhotoDelete(filename)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <ColoringPageProgressNotes pageId={page.id} target={progressNoteTarget} />
    </div>
  );
}
