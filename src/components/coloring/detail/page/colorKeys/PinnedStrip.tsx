import {
  useColorReference,
  useColorReferenceImages,
} from '@/hooks/queries/coloring/useColorReference';
import { ColorReferenceViewer } from '../ColorReferenceViewer';

/** Keeps the first strip photo in view while a color is being recorded. */
export function PinnedStrip({ pageId, userId }: { pageId: string; userId: string }) {
  const reference = useColorReference(pageId, userId);
  const first = useColorReferenceImages(reference.data, userId).data?.[0];
  if (!first) return null;
  return (
    // Sits just below the sticky site header.
    <div className="bg-background/90 sticky top-[calc(80px+env(safe-area-inset-top))] z-10 -mx-2 px-2 py-2 backdrop-blur-md">
      <ColorReferenceViewer
        {...first}
        // The strip spans the page; the 320px thumbnail would blur.
        thumbnail={first.original}
        index={1}
        label="Color strip"
        className="bg-muted/30 h-16 sm:h-28 [&_img]:object-contain"
      />
    </div>
  );
}
