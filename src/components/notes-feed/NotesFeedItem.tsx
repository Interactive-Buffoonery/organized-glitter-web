import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { formatLocalDate, parseTimestamp } from '@/utils/date/timezoneUtils';
import { Gem, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import MarkdownContent from '@/components/notes/MarkdownContent';
import { cn } from '@/lib/utils';
import type { NotesFeedItem as NotesFeedItemModel } from '@/hooks/queries/useNotesFeed';

/**
 * Format a feed date as a self-contained weekday label, e.g. "Thu, May 28".
 *
 * A bare ordinal ("the 28th") reads as a fragment once the month heading has
 * scrolled away, so each note carries a complete date. The month repeats the
 * timeline group heading on purpose - that is what keeps a note legible alone.
 *
 * Date-only strings (`yyyy-MM-dd`) are constructed in local time so a note
 * logged on the 1st never drifts to the previous day via UTC parsing; full
 * ISO timestamps fall back to `parseTimestamp`.
 */
function formatDateLabel(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return formatLocalDate(new Date(year, month - 1, day), 'EEE, MMM d');
  }
  return formatLocalDate(parseTimestamp(value), 'EEE, MMM d');
}

const craftConfig = {
  diamond: {
    Icon: Gem,
    /** Diamond uses the dedicated diamond-* ramp; readable in both themes. */
    nodeClass: 'bg-diamond-500 text-white',
    label: 'Diamond painting note',
  },
  coloring: {
    Icon: Palette,
    /** No coloring-* ramp exists; the accent orchid is the closest token. */
    nodeClass: 'bg-accent text-accent-foreground',
    label: 'Coloring page note',
  },
} as const;

/**
 * A single note as an entry on the journal timeline.
 *
 * The note hangs off the rail drawn by `NotesTimeline`: a craft-tinted node
 * sits on the spine, a quiet meta line carries the day and project context,
 * and the written note itself is the visual lead. The entry has no border or
 * card of its own - it takes its height from its content, so a one-line note
 * and a note with a photo read as genuinely different moments.
 */
export function NotesFeedItem({ item }: { item: NotesFeedItemModel }) {
  const dateLabel = formatDateLabel(item.date);
  const { Icon, nodeClass, label } = craftConfig[item.kind];

  return (
    <article className="relative pl-7">
      {/* Craft node, centred on the rail. */}
      <span
        className={cn(
          'border-background absolute top-0.5 left-0 grid size-3.5 -translate-x-px place-items-center rounded-full border-2',
          nodeClass
        )}
      >
        <Icon className="size-2" aria-hidden="true" strokeWidth={2.5} />
        <span className="sr-only">{label}</span>
      </span>

      {/* Meta line: when, and which project the note belongs to. */}
      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        <span className="text-foreground/70 font-mono">{dateLabel}</span>
        <span aria-hidden="true">·</span>
        <Link
          to={item.source.detailUrl}
          className="text-foreground hover:text-primary focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {item.source.title}
        </Link>
        {item.source.subtitle ? <span>{item.source.subtitle}</span> : null}
      </div>

      {/* The note itself - the visual lead. */}
      <div className="text-foreground mt-2 text-[15px] leading-6">
        <MarkdownContent content={item.content} />
      </div>

      {/* A progress photo breaks the text column on sm+ for visual rhythm. */}
      {item.imageUrl ? (
        <PrivateFileImage
          src={item.imageUrl}
          alt={`Progress update from ${dateLabel}`}
          className="bg-muted mt-3 aspect-[4/3] w-full rounded-xl object-cover sm:-mr-6 sm:w-[calc(100%+1.5rem)] md:-mr-8 md:w-[calc(100%+2rem)]"
          loading="lazy"
        />
      ) : null}
    </article>
  );
}
