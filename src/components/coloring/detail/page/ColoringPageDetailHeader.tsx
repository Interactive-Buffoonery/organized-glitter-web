import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import {
  getColoringBookDetailPath,
  getColoringPageDetailPath,
} from '@/pages/coloringBookNavigation';

export function ColoringPageNavigation({
  book,
  previousPage,
  nextPage,
  returnTo,
  onEdit,
}: {
  book: ColoringBookDTO;
  previousPage: ColoringPageDTO | null;
  nextPage: ColoringPageDTO | null;
  returnTo: string;
  onEdit: () => void;
}) {
  return (
    <nav aria-label="Coloring page" className="flex items-center justify-between gap-2">
      <Button asChild variant="ghost" size="touch" className="min-w-0 px-2">
        <Link to={getColoringBookDetailPath(book.id, returnTo)}>
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{book.title}</span>
        </Link>
      </Button>
      <div className="flex shrink-0 items-center">
        {(
          [
            ['Previous', previousPage, ChevronLeft],
            ['Next', nextPage, ChevronRight],
          ] as const
        ).map(([label, page, Icon]) =>
          page ? (
            <Button key={label} asChild variant="ghost" size="icon-touch">
              <Link
                to={getColoringPageDetailPath(book.id, page.id, returnTo)}
                aria-label={`${label} coloring page, page ${page.pageNumber}`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="icon-touch"
              disabled
              aria-label={`${label} coloring page`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </Button>
          )
        )}
        <Button type="button" variant="ghost" size="touch" className="px-2" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>
      </div>
    </nav>
  );
}

export function ColoringPageDetailHeader({
  book,
  page,
  returnTo = '/dashboard?craft=coloring',
}: {
  book: ColoringBookDTO;
  page: ColoringPageDTO;
  returnTo?: string;
}) {
  return (
    <header className="lg:border-border/60 min-w-0 space-y-2 lg:border-b lg:pb-6">
      <h1 className="font-handwritten text-4xl leading-tight tracking-tight md:text-5xl">
        {page.revealedSubject.trim() || `Page ${page.pageNumber}`}
      </h1>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
        <Link
          to={getColoringBookDetailPath(book.id, returnTo)}
          className="text-foreground decoration-primary/50 inline-flex min-h-11 items-center font-semibold underline decoration-2 underline-offset-4"
        >
          {book.title}
        </Link>
        {book.illustratorName && (
          <>
            <span aria-hidden="true">·</span>
            <span>{book.illustratorName}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>
          {page.pageNumber} of {book.totalPages}
        </span>
      </p>
    </header>
  );
}
