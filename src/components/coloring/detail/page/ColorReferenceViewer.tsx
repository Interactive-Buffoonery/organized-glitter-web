import { useState } from 'react';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ColorReferenceViewer({
  thumbnail,
  original,
  index,
}: {
  thumbnail: string;
  original: string;
  index: number;
}) {
  const [zoom, setZoom] = useState(1);
  return (
    <Dialog onOpenChange={() => setZoom(1)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-24 w-full p-0"
          aria-label={`Open swatch photo ${index}`}
        >
          <PrivateFileImage
            src={thumbnail}
            loading="lazy"
            decoding="async"
            alt={`Swatch sheet ${index}`}
            className="size-full rounded-md object-contain"
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto [&>button:last-child]:size-11">
        <DialogHeader className="pr-12">
          <DialogTitle>Swatch photo {index}</DialogTitle>
          <DialogDescription>
            Zoom in to read the sheet. Scroll or swipe to move around.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="glass"
            disabled={zoom <= 1}
            onClick={() => setZoom(value => Math.max(1, value - 0.5))}
          >
            Zoom out
          </Button>
          <Button
            type="button"
            variant="glass"
            disabled={zoom >= 6}
            onClick={() => setZoom(value => Math.min(6, value + 0.5))}
          >
            Zoom in
          </Button>
          <Button type="button" variant="ghost" onClick={() => setZoom(1)}>
            Reset
          </Button>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- A focusable scroll region supports keyboard panning. */}
        <section
          // The scroll region needs keyboard focus for arrow-key panning.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          onKeyDown={event => {
            const offsets: Record<string, [number, number]> = {
              ArrowDown: [0, 64],
              ArrowUp: [0, -64],
              ArrowLeft: [-64, 0],
              ArrowRight: [64, 0],
            };
            const offset = offsets[event.key];
            if (!offset) return;
            event.preventDefault();
            event.currentTarget.scrollLeft += offset[0];
            event.currentTarget.scrollTop += offset[1];
          }}
          aria-label="Swatch photo, scroll to pan"
          className="border-border focus-visible:ring-ring h-[60dvh] overflow-auto rounded-md border focus-visible:ring-2"
        >
          <PrivateFileImage
            src={original}
            alt={`Full swatch sheet ${index}`}
            className="max-w-none object-contain"
            style={{ height: `${60 * zoom}dvh`, width: zoom === 1 ? '100%' : 'auto' }}
          />
        </section>
      </DialogContent>
    </Dialog>
  );
}
