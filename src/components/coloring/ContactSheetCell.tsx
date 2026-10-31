import { Link } from 'react-router-dom';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { cn } from '@/lib/utils';
import { getColoringPageDetailPath } from '@/pages/coloringBookNavigation';
import { ColoringService, type ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { getColoringPageStatusAriaLabel } from './coloringPagePresentation';

interface ContactSheetCellProps {
  bookId: string;
  page: ColoringPageDTO;
  returnTo: string;
  isMysteryBook?: boolean;
  latestPhoto?: string;
}

export function ContactSheetCell({
  bookId,
  page,
  returnTo,
  isMysteryBook = false,
  latestPhoto,
}: ContactSheetCellProps) {
  const hidden = isMysteryBook && !page.revealedSubject;
  const photo = hidden
    ? undefined
    : latestPhoto || ColoringService.getPagePhotoUrls(page, '320x420')[0];
  return (
    <Link
      to={getColoringPageDetailPath(bookId, page.id, returnTo)}
      className="border-border/60 bg-card focus-visible:ring-ring relative block aspect-[3/4] min-h-11 min-w-11 overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
      aria-label={`Open page ${page.pageNumber}. ${page.revealedSubject ? `${page.revealedSubject}. ` : ''}${getColoringPageStatusAriaLabel(page.status)}${hidden ? '. Mystery unrevealed.' : ''}`}
    >
      {photo ? (
        <PrivateFileImage src={photo} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="text-muted-foreground font-handwritten absolute inset-0 grid place-items-center text-4xl">
          {page.pageNumber}
        </span>
      )}
      {photo && (
        <span className="bg-background/90 text-foreground absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-xs font-semibold">
          {page.pageNumber}
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          'ring-card absolute top-2 right-2 size-2.5 rounded-full ring-2',
          page.status === 'completed'
            ? 'bg-emerald-600 dark:bg-emerald-300'
            : page.status === 'not_started'
              ? 'border-muted-foreground bg-card border'
              : 'bg-accent'
        )}
      />
    </Link>
  );
}
