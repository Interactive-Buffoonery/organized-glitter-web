import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Circle } from 'lucide-react';
import { ColoringBookTagManager } from '@/components/coloring/ColoringBookTagManager';
import { SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import {
  ColoringBooksStatusOptions,
  type ColoringBooksStatusOptions as ColoringBookStatus,
} from '@/types/pocketbase.types';
import type { Tag } from '@/types/tag';
import { countUnit } from '@/utils/countUnit';
import { getColoringBookStatusColor, getColoringBookStatusLabel } from '@/utils/statusColors';

interface ColoringBookHeroProps {
  book: ColoringBookDTO;
  coverUrl: string;
  metadataLine: string;
  safeCompletedPages: number;
  safeCompletionPct: number;
  tags: Tag[];
  updatePending: boolean;
  isSavingTags: boolean;
  onStatusChange: (status: ColoringBookStatus) => void;
  onTagsChange: (nextTags: Tag[]) => void;
}

export const ColoringBookHero = ({
  book,
  coverUrl,
  metadataLine,
  safeCompletedPages,
  safeCompletionPct,
  tags,
  updatePending,
  isSavingTags,
  onStatusChange,
  onTagsChange,
}: ColoringBookHeroProps) => (
  <header className="grid gap-6 md:grid-cols-[minmax(12rem,17.5rem)_minmax(0,1fr)] md:items-start lg:gap-10">
    <div className="border-border relative overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_hsl(var(--glass-highlight))]">
      {coverUrl ? (
        <PrivateFileImage
          src={coverUrl}
          alt={book.title}
          className="aspect-[3/4] w-full object-cover"
        />
      ) : (
        <div className="feat-paper text-muted-foreground flex aspect-[3/4] items-center justify-center text-center text-sm">
          No cover
        </div>
      )}
      {book.isMystery ? (
        <span className="bg-primary/85 absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-medium text-white shadow-sm">
          Mystery
        </span>
      ) : null}
    </div>

    <div className="min-w-0 space-y-6 md:pt-2">
      <div className="space-y-2">
        <h1 className="font-handwritten text-4xl leading-none tracking-tight md:text-5xl">
          {book.title}
        </h1>
        {metadataLine ? <p className="text-muted-foreground text-sm">{metadataLine}</p> : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  'h-auto rounded-full px-3 py-1 text-xs font-medium pointer-coarse:min-h-11 pointer-coarse:px-4',
                  getColoringBookStatusColor(book.status)
                )}
              >
                <Circle className="mr-1.5 size-3 fill-current" aria-hidden />
                {getColoringBookStatusLabel(book.status)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <div className="space-y-1" aria-label="Change book status">
                {Object.values(ColoringBooksStatusOptions).map(status => (
                  <Button
                    key={status}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onStatusChange(status)}
                    disabled={updatePending}
                  >
                    <span
                      className={cn(
                        'mr-2 size-2.5 rounded-full',
                        getColoringBookStatusColor(status).split(' ')[0]
                      )}
                      aria-hidden="true"
                    />
                    {getColoringBookStatusLabel(status)}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="text-sm">
            <span className="font-medium tabular-nums">{safeCompletedPages}</span>
            <span className="text-muted-foreground">
              {' '}
              of {book.totalPages} {countUnit(book.totalPages, 'page')} completed
            </span>
          </div>
          <span className="text-muted-foreground text-sm tabular-nums">
            {Math.round(safeCompletionPct)}%
          </span>
        </div>

        <Progress
          value={safeCompletionPct}
          className="h-0.5 max-w-xl"
          aria-label="Book completion"
        />
      </div>

      <section className="max-w-xl">
        <SectionHeading as="h2" className="mb-3">
          Tags
        </SectionHeading>
        <ColoringBookTagManager
          selectedTags={tags}
          disabled={updatePending || isSavingTags}
          onTagsChange={onTagsChange}
          withSection={false}
          emptyText="No tags yet."
        />
      </section>
    </div>
  </header>
);
