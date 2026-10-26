import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useColorReference,
  useColorReferenceImages,
} from '@/hooks/queries/coloring/useColorReference';
import { ColorReferenceViewer } from '../ColorReferenceViewer';

/** Keeps a strip photo in view while a color is being recorded; arrows switch photos. */
export function PinnedStrip({
  pageId,
  userId,
  photo,
  onPhotoChange,
}: {
  pageId: string;
  userId: string;
  photo: number;
  onPhotoChange: (photo: number) => void;
}) {
  const reference = useColorReference(pageId, userId);
  const photos = useColorReferenceImages(reference.data, userId).data ?? [];
  if (!photos.length) return null;
  // A photo removed on another device can leave the choice past the end.
  const index = Math.min(photo, photos.length - 1);
  const shown = photos[index];
  const many = photos.length > 1;
  const position = `${index + 1} of ${photos.length}`;
  return (
    // Sits just below the sticky site header.
    <div className="bg-background/90 sticky top-[var(--site-header-total-height)] z-10 -mx-2 flex items-center gap-1 px-2 py-2 backdrop-blur-md">
      {many ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label="Previous strip photo"
          disabled={index === 0}
          onClick={() => onPhotoChange(index - 1)}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
      ) : null}
      <div className="relative min-w-0 flex-1">
        <ColorReferenceViewer
          {...shown}
          thumbnail={shown.strip}
          index={index + 1}
          label={many ? `Color strip ${position}` : 'Color strip'}
          className="bg-muted/30 h-16 sm:h-28 [&_img]:object-contain"
        />
        {many ? (
          <span
            aria-hidden="true"
            className="bg-background/85 pointer-events-none absolute right-1 bottom-1 rounded px-1.5 text-xs tabular-nums"
          >
            {position}
          </span>
        ) : null}
      </div>
      {many ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label="Next strip photo"
          disabled={index === photos.length - 1}
          onClick={() => onPhotoChange(index + 1)}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
