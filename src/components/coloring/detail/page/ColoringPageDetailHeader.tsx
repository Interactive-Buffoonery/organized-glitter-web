import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getColoringPageStatusPresentation } from '@/components/coloring/coloringPagePresentation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { getColoringPageStatusLabel } from '@/utils/statusColors';
import {
  getColoringBookDetailPath,
  getColoringPageDetailPath,
} from '@/pages/coloringBookNavigation';

interface ColoringPageDetailHeaderProps {
  book: ColoringBookDTO;
  page: ColoringPageDTO;
  previousPage: ColoringPageDTO | null;
  nextPage: ColoringPageDTO | null;
  returnTo: string;
}

export function ColoringPageDetailHeader({
  book,
  page,
  previousPage,
  nextPage,
  returnTo,
}: ColoringPageDetailHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="min-w-0">
          <Link to={getColoringBookDetailPath(book.id, returnTo)}>
            <ChevronLeft className="mr-2 size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{book.title}</span>
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="font-handwritten text-5xl leading-none tracking-tight md:text-6xl">
            Page {page.pageNumber}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link
              to={getColoringBookDetailPath(book.id, returnTo)}
              className="text-link truncate underline-offset-2 hover:underline"
            >
              {book.title}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="tabular-nums">
              {page.pageNumber} of {book.totalPages}
            </span>
            <span aria-hidden="true">/</span>
            <span
              className={cn(
                'font-medium',
                getColoringPageStatusPresentation(page.status).textClassName
              )}
            >
              {getColoringPageStatusLabel(page.status)}
            </span>
          </div>
        </div>

        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          {previousPage ? (
            <Button asChild variant="ghost" size="sm">
              <Link
                to={getColoringPageDetailPath(book.id, previousPage.id, returnTo)}
                aria-label={`Previous coloring page, page ${previousPage.pageNumber}`}
              >
                <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
                {previousPage.pageNumber}
              </Link>
            </Button>
          ) : null}
          {nextPage ? (
            <Button asChild variant="ghost" size="sm">
              <Link
                to={getColoringPageDetailPath(book.id, nextPage.id, returnTo)}
                aria-label={`Next coloring page, page ${nextPage.pageNumber}`}
              >
                {nextPage.pageNumber}
                <ChevronRight className="ml-1 size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
    </>
  );
}
