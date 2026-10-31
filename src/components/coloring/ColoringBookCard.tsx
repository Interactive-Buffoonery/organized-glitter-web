import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getColoringBookStatusColor, getColoringBookStatusLabel } from '@/utils/statusColors';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { getColoringBookDetailPath } from '@/pages/coloringBookNavigation';
import type { ColoringBookCardData } from './coloringBookCardTypes';
import { StatusPill } from '@/components/shared/StatusPill';
import { getColoringCompletedPages } from './coloringBookPresentation';

export type { ColoringBookCardData } from './coloringBookCardTypes';

interface ColoringBookCardProps {
  book: ColoringBookCardData;
  skipImageLoading?: boolean;
}

export function ColoringBookCard({ book, skipImageLoading = false }: ColoringBookCardProps) {
  const location = useLocation();
  const coverUrl = book.coverImage ? ColoringService.getCoverImageUrl(book) : '';
  const pct = book.completionPercentage ?? 0;
  const statusLabel = getColoringBookStatusLabel(book.status);
  const statusColor = getColoringBookStatusColor(book.status);
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <Link
      to={getColoringBookDetailPath(book.id, returnTo)}
      state={{ returnTo }}
      className={cn(
        'glow-hover text-card-foreground focus-visible:ring-ring group bg-card hover:border-primary/20 flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:outline-none'
      )}
    >
      <div className="relative w-full">
        <AspectRatio ratio={4 / 3}>
          {coverUrl ? (
            <PrivateFileImage
              src={coverUrl}
              alt={book.title}
              loading={skipImageLoading ? 'eager' : 'lazy'}
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <div className="feat-paper flex size-full items-center justify-center">
              <BookOpen className="text-muted-foreground/60 size-10" aria-hidden />
            </div>
          )}
        </AspectRatio>

        {book.isMystery && (
          <span className="bg-secondary text-secondary-foreground absolute top-2 left-2 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm">
            Mystery
          </span>
        )}
      </div>

      <div className="w-full min-w-0 p-3">
        <div className="space-y-2">
          <div className="flex min-h-9 items-start">
            <h3 className="group-hover:text-link line-clamp-2 text-sm leading-tight font-semibold transition-colors duration-200">
              {book.title}
            </h3>
          </div>

          <p className="text-muted-foreground flex h-5 items-center truncate text-xs">
            {[book.publisherName, book.illustratorName].filter(Boolean).join(' · ') || ' '}
          </p>

          <div className="flex items-center gap-2">
            <Progress
              value={pct}
              className="h-1 flex-1"
              aria-label={`Completion for ${book.title}`}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill label={statusLabel} className={statusColor} />
            <span className="text-muted-foreground text-xs tabular-nums">
              {getColoringCompletedPages(book)} of {book.totalPages}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
