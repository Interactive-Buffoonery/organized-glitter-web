import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Link } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColoringPageDetailPath } from '@/pages/coloringBookNavigation';
import { ColoringService, type ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import {
  getColoringPageStatusAriaLabel,
  getColoringPageStatusPresentation,
  getContactSheetCellVariant,
} from './coloringPagePresentation';

interface ContactSheetCellProps {
  bookId: string;
  page: ColoringPageDTO;
  returnTo: string;
  isMysteryBook?: boolean;
}

export function ContactSheetCell({
  bookId,
  page,
  returnTo,
  isMysteryBook = false,
}: ContactSheetCellProps) {
  const [leadPhoto] = ColoringService.getPagePhotoUrls(page, '320x420');
  const variant = getContactSheetCellVariant(page, isMysteryBook);
  const status = getColoringPageStatusPresentation(page.status);
  const StatusIcon = status.Icon;
  const statusLabel = getColoringPageStatusAriaLabel(page.status);
  const showPhoto = leadPhoto && (variant === 'photo' || variant === 'mystery-revealed');
  const isMysteryUnrevealed = variant === 'mystery-unrevealed';

  return (
    <Link
      to={getColoringPageDetailPath(bookId, page.id, returnTo)}
      className={cn(
        'glow-hover focus-visible:ring-ring group relative block aspect-[3/4] overflow-hidden rounded-md border-b-2 transition duration-200 focus-visible:ring-2 focus-visible:outline-none',
        'hover:-translate-y-0.5',
        status.edgeClassName,
        isMysteryUnrevealed ? 'bg-card' : 'bg-muted/30'
      )}
      aria-label={`Open page ${page.pageNumber}. ${statusLabel}${
        isMysteryUnrevealed ? '. Mystery unrevealed.' : ''
      }`}
    >
      {showPhoto ? (
        <PrivateFileImage
          src={leadPhoto}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : isMysteryUnrevealed ? (
        <div className="flex size-full items-center justify-center">
          <span className="text-primary/85 font-handwritten text-5xl leading-none font-semibold md:text-6xl">
            {page.pageNumber}
          </span>
          <span
            aria-hidden="true"
            className="text-primary/10 font-handwritten absolute top-3 right-3 text-7xl leading-none font-bold"
          >
            *
          </span>
        </div>
      ) : (
        <div className="text-muted-foreground/70 flex size-full flex-col items-center justify-center gap-2">
          <span className="font-handwritten text-5xl leading-none font-semibold md:text-6xl">
            {page.pageNumber}
          </span>
          <ImageIcon className="size-4" aria-hidden="true" />
        </div>
      )}

      <span
        className={cn(
          'absolute bottom-2 left-2 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold tabular-nums',
          showPhoto
            ? 'bg-background/80 text-foreground shadow-sm backdrop-blur-sm'
            : 'text-foreground/80 bg-transparent'
        )}
      >
        {page.pageNumber}
      </span>

      <span
        className={cn(
          'bg-background/80 absolute right-2 bottom-2 rounded-full p-1 shadow-sm backdrop-blur-sm',
          status.textClassName
        )}
        title={status.label}
        aria-label={statusLabel}
      >
        <StatusIcon className="size-3.5" aria-hidden="true" />
      </span>

      <span className="sr-only">{status.label}</span>
      {isMysteryUnrevealed ? <span className="sr-only">Mystery unrevealed</span> : null}
    </Link>
  );
}
