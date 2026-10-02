import { NotesFeedItem } from '@/components/notes-feed/NotesFeedItem';
import type { NotesFeedMonthGroup } from '@/components/notes-feed/groupItemsByMonth';

interface NotesTimelineProps {
  groups: NotesFeedMonthGroup[];
}

/**
 * The journal feed as a single continuous timeline.
 *
 * A vertical rail is drawn once per month group, not once for the whole feed:
 * each segment starts below its month heading and runs down that month's
 * notes. The month heading therefore owns the timeline spine as a plain
 * chapter break, with no rail running behind its text - the rail simply does
 * not exist there. Individual notes still hang off the segment, so the feed
 * reads as a thread of dated moments rather than a stack of separate cards.
 * `NotesFeedItem` only positions its own node dot against the segment.
 *
 * Month groups fade in with a small per-group stagger. `animate-in` ships
 * with `tw-animate-css` and is already neutralised under
 * `prefers-reduced-motion` in `index.css`, so no extra motion guard is needed.
 */
export function NotesTimeline({ groups }: NotesTimelineProps) {
  return (
    <div className="space-y-8">
      {groups.map((group, groupIndex) => (
        <section
          key={group.key}
          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both space-y-5"
          style={{ animationDelay: `${groupIndex * 70}ms` }}
        >
          {/* Month marker: a flush chapter heading with a hairline rule, so
              each month reads as a chapter break that begins the timeline
              spine rather than hanging off it as one more node. */}
          <div className="border-border/60 border-b pb-2">
            <h2 className="text-foreground text-lg font-semibold tracking-tight">{group.label}</h2>
          </div>

          {/* The rail segment for this month: a hairline spanning only this
              group's notes. It is `relative`-anchored to the notes wrapper, so
              it begins below the heading and never runs behind the heading
              text. `left-[5px]` matches the note dot centres. */}
          <div className="relative space-y-6">
            <span
              aria-hidden="true"
              className="bg-border absolute top-1.5 bottom-1.5 left-[5px] w-px"
            />
            {group.items.map(item => (
              <NotesFeedItem key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
