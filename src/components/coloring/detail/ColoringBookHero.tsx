import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { ChevronDown, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import {
  ColoringBooksStatusOptions,
  type ColoringBooksStatusOptions as ColoringBookStatus,
} from '@/types/pocketbase.types';
import { getColoringBookStatusColor, getColoringBookStatusLabel } from '@/utils/statusColors';

interface ColoringBookHeroProps {
  book: ColoringBookDTO;
  coverUrl: string;
  inProgressPages: number | undefined;
  safeCompletedPages: number;
  safeCompletionPct: number;
  updatePending: boolean;
  onStatusChange: (status: ColoringBookStatus) => void;
}

export const ColoringBookHero = ({
  book,
  coverUrl,
  inProgressPages,
  safeCompletedPages,
  safeCompletionPct,
  updatePending,
  onStatusChange,
}: ColoringBookHeroProps) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3.5">
      {coverUrl && (
        <PrivateFileImage
          src={coverUrl}
          alt={book.title}
          className="border-border/60 h-[100px] w-[76px] shrink-0 rounded-lg border object-cover"
        />
      )}
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                disabled={updatePending}
                variant="ghost"
                className={cn(
                  'text-accent bg-accent/10 min-h-11 rounded-full px-3 text-xs font-semibold'
                )}
              >
                <Circle className="mr-1.5 size-3 fill-current" aria-hidden />
                {getColoringBookStatusLabel(book.status)}
                <ChevronDown className="ml-1 size-3" aria-hidden="true" />
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

          <span className="text-muted-foreground text-xs tabular-nums">
            {safeCompletedPages} of {book.totalPages} done
          </span>
        </div>
        <Progress
          value={safeCompletionPct}
          className="h-0.5 max-w-xl"
          aria-label="Book completion"
        />
      </div>
    </div>
    <dl className="border-border bg-card/60 grid grid-cols-3 overflow-hidden rounded-lg border">
      {[
        ['pages', book.totalPages],
        ['done', safeCompletedPages],
        ['in progress', inProgressPages ?? '…'],
      ].map(([label, value]) => (
        <div key={label} className="border-border/60 border-l py-2 text-center first:border-l-0">
          <dd className="font-mono text-sm">{value}</dd>
          <dt className="text-muted-foreground text-xs">{label}</dt>
        </div>
      ))}
    </dl>
  </div>
);
