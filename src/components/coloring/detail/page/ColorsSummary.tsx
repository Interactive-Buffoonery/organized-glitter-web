import { Link } from 'react-router-dom';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { useColorKeys, useSymbolRequests } from '@/hooks/queries/coloring/useColorKeys';
import {
  useColorReference,
  useColorReferenceImages,
} from '@/hooks/queries/coloring/useColorReference';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { getColoringPageColorsPath } from '@/pages/coloringBookNavigation';
import { copyColorKeys } from './colorKeys/copyColorKeys';
import { SymbolGlyph } from './colorKeys/SymbolGlyph';
import { colorKeyLabel, requestFor, safeSwatch } from './colorKeys/symbolName';

const MAX_THUMBNAILS = 4;

interface ColorsSummaryProps {
  bookId: string;
  pageId: string;
  returnTo: string;
}

/** Read-only view of a page's color key and strip photos; editing lives on the colors page. */
export function ColorsSummary(props: ColorsSummaryProps) {
  const { user } = useAuth();
  if (!user) return null;
  return <ColorsSummaryContent key={`${user.id}:${props.pageId}`} {...props} userId={user.id} />;
}

function ColorsSummaryContent({
  bookId,
  pageId,
  returnTo,
  userId,
}: ColorsSummaryProps & { userId: string }) {
  const keys = useColorKeys(pageId, userId);
  const reference = useColorReference(pageId, userId);
  const images = useColorReferenceImages(reference.data, userId);
  const rows = keys.data ?? [];
  const requests = useSymbolRequests(
    userId,
    rows.map(row => row.symbol)
  ).data;
  const colorsPath = getColoringPageColorsPath(bookId, pageId, returnTo);
  const photoCount = reference.data?.photos.length ?? 0;
  const tileCount = Math.min(photoCount, MAX_THUMBNAILS);
  const hiddenPhotos = photoCount - tileCount;
  const filled = rows.filter(row => row.code.trim()).length;
  const hasError = keys.isError || reference.isError;
  const isPending =
    (keys.isPending && !keys.isError) || (reference.isPending && !reference.isError);
  const isEmpty =
    !hasError &&
    rows.length === 0 &&
    !reference.data?.photos.length &&
    !reference.data?.notes.trim();

  return (
    <Section variant="bordered" className="space-y-3" landmark={false}>
      <SectionHeading>Colors</SectionHeading>
      {hasError ? (
        <div role="alert" className="text-sm">
          Could not load the colors for this page.{' '}
          <Button
            type="button"
            variant="link"
            onClick={() => {
              if (keys.isError) void keys.refetch();
              if (reference.isError) void reference.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading colors…
        </p>
      ) : isEmpty ? (
        <>
          <p className="text-muted-foreground text-sm">
            Keep the symbols, color codes, and strip photos for this page in one place.
          </p>
          <Button asChild>
            <Link to={colorsPath}>Track this page's colors</Link>
          </Button>
        </>
      ) : (
        <>
          {images.isError ? (
            <p role="alert" className="text-sm">
              Could not load photos.{' '}
              <Button type="button" variant="link" onClick={() => void images.refetch()}>
                Try again
              </Button>
            </p>
          ) : tileCount ? (
            <ul aria-label="Color photos" className="flex gap-2">
              {Array.from({ length: tileCount }, (_, index) => {
                const image = images.data?.[index];
                const isLast = index === tileCount - 1;
                return (
                  <li key={image?.filename ?? index} className="relative size-14 shrink-0">
                    {image ? (
                      <PrivateFileImage
                        src={image.thumbnail}
                        loading="lazy"
                        decoding="async"
                        alt={`Color photo ${index + 1}`}
                        className="border-border size-full rounded-md border object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="bg-muted block size-full animate-pulse rounded-md"
                      />
                    )}
                    {isLast && hiddenPhotos > 0 ? (
                      <span className="bg-background/80 absolute inset-0 flex items-center justify-center rounded-md text-sm font-medium">
                        <span aria-hidden="true">+{hiddenPhotos}</span>
                        <span className="sr-only">{hiddenPhotos} more photos</span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {rows.length ? (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {rows.map(row => {
                const request = requestFor(row.symbol, requests);
                const text = row.code.trim() || row.color_name.trim() || 'No code';
                return (
                  <li key={row.id} title={text} className="flex min-w-0 items-center gap-2">
                    <span className="sr-only">{colorKeyLabel(row, request)}</span>
                    <span aria-hidden="true" className="flex w-6 shrink-0 justify-center text-lg">
                      <SymbolGlyph symbol={row.symbol} request={request} />
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        row.code.trim() ? 'font-mono' : 'text-muted-foreground'
                      )}
                    >
                      {text}
                    </span>
                    {safeSwatch(row.swatch) ? (
                      <span
                        aria-hidden="true"
                        className="border-border size-3.5 shrink-0 rounded-full border"
                        style={{ background: safeSwatch(row.swatch) }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {rows.length ? (
              <span className="text-muted-foreground text-sm">
                {filled} of {rows.length} filled in
              </span>
            ) : null}
            <Button asChild variant="link" className="px-0">
              <Link to={colorsPath}>Edit colors</Link>
            </Button>
            {rows.length ? (
              <Button
                type="button"
                variant="link"
                className="ml-auto px-0"
                onClick={() => void copyColorKeys(rows, requests)}
              >
                Copy
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Section>
  );
}
