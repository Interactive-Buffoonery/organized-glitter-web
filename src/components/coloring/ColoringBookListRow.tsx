import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Circle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { getColoringBookStatusColor, getColoringBookStatusLabel } from '@/utils/statusColors';
import { getColoringBookDetailPath } from '@/pages/coloringBookNavigation';
import type { ColoringBookCardData } from './coloringBookCardTypes';
import {
  formatColoringCompletionPercent,
  getColoringActivityLabel,
  getColoringProgressLabel,
  getColoringPublisherLabel,
} from './coloringBookPresentation';

interface ColoringBookListRowProps {
  book: ColoringBookCardData;
}

function ColoringBookListRow({ book }: ColoringBookListRowProps) {
  const location = useLocation();
  const coverUrl = book.coverImage ? ColoringService.getCoverImageUrl(book, '160x220') : '';
  const completionPercentage = book.completionPercentage ?? 0;
  const statusLabel = getColoringBookStatusLabel(book.status);
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <Link
      to={getColoringBookDetailPath(book.id, returnTo)}
      state={{ returnTo }}
      role="listitem"
      aria-label={`Open coloring book ${book.title}`}
      className="glow-hover text-card-foreground focus-visible:ring-ring group border-border bg-card hover:border-primary/20 flex w-full overflow-hidden rounded-xl border text-left shadow-sm transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-muted relative h-28 w-20 shrink-0 sm:h-32 sm:w-24">
        {coverUrl ? (
          <PrivateFileImage
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="feat-paper flex size-full items-center justify-center">
            <BookOpen className="text-muted-foreground/60 size-8" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="group-hover:text-link line-clamp-1 text-sm leading-tight font-semibold transition-colors duration-200">
            {book.title}
          </h3>
          <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
            {getColoringPublisherLabel(book)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Progress
            value={completionPercentage}
            className="h-1.5 flex-1"
            aria-label={`Completion for ${book.title}`}
          />
          <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
            {formatColoringCompletionPercent(book)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {getColoringProgressLabel(book)} · {getColoringActivityLabel(book)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                getColoringBookStatusColor(book.status)
              )}
            >
              <Circle className="size-2.5 fill-current" aria-hidden />
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default ColoringBookListRow;
