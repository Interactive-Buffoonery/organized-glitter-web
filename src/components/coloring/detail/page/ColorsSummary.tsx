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
import { getColoringPageColorsPath } from '@/pages/coloringBookNavigation';
import { copyColorKeys } from './colorKeys/copyColorKeys';
import { ColorKeyRowContent } from './colorKeys/ColorKeyRowContent';
import { colorKeyLabel, requestFor } from './colorKeys/symbolName';

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Colors</SectionHeading>
        {!isEmpty && (
          <div className="flex gap-3">
            {rows.length > 0 && (
              <Button
                type="button"
                variant="link"
                className="min-h-11 px-0"
                onClick={() => void copyColorKeys(rows, requests)}
              >
                Copy
              </Button>
            )}
            <Button asChild variant="link" className="min-h-11 px-0">
              <Link to={colorsPath}>Edit colors</Link>
            </Button>
          </div>
        )}
      </div>
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
        <Button asChild variant="link" className="min-h-11 px-0">
          <Link to={colorsPath}>Track the colors used for this page</Link>
        </Button>
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
                return (
                  <li
                    key={row.id}
                    title={row.code.trim() || row.color_name.trim() || undefined}
                    className="min-w-0"
                  >
                    <span className="sr-only">{colorKeyLabel(row, request)}</span>
                    <Link
                      to={colorsPath}
                      className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 items-center gap-2 rounded-md px-1 focus-visible:ring-2"
                      aria-label={`Edit ${colorKeyLabel(row, request)}`}
                    >
                      <ColorKeyRowContent
                        row={{ ...row, color_name: row.code.trim() ? row.color_name : 'Add code' }}
                        request={request}
                        compact
                      />
                      {!row.swatch && (
                        <span
                          aria-hidden="true"
                          className="border-border size-4 shrink-0 rounded border border-dashed"
                        />
                      )}
                    </Link>
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
          </div>
        </>
      )}
    </Section>
  );
}
