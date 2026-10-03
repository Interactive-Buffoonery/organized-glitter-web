import { formatLocalDate, parseTimestamp } from '@/utils/date/timezoneUtils';
import type { NotesFeedItem } from '@/hooks/queries/useNotesFeed';

export interface NotesFeedMonthGroup {
  /** Stable `yyyy-MM` key for React lists and grouping. */
  key: string;
  /** Display label, e.g. "May 2026". */
  label: string;
  items: NotesFeedItem[];
}

/**
 * Resolve a `yyyy-MM` key from a feed item's date.
 *
 * Date-only strings (`yyyy-MM-dd`) are sliced directly so a note logged on the
 * 1st never drifts into the previous month via UTC parsing - the same defense
 * `formatNoteDate` uses. Full ISO timestamps fall back to `parseTimestamp`.
 */
function monthKey(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.slice(0, 7);
  }
  return formatLocalDate(parseTimestamp(date), 'yyyy-MM');
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return formatLocalDate(new Date(year, month - 1, 1), 'MMMM yyyy');
}

function warnIfItemsAreUnsorted(items: NotesFeedItem[]): void {
  if (!import.meta.env.DEV) return;

  for (let index = 1; index < items.length; index += 1) {
    if (items[index].date > items[index - 1].date) {
      console.warn('groupItemsByMonth: items are not sorted newest-first');
      break;
    }
  }
}

/**
 * Group date-sorted feed items into month buckets.
 *
 * Callers must pass items already sorted newest-first (the contract
 * `useNotesFeed` guarantees via `sortFeedItems`). A single forward pass opens a
 * new bucket whenever the month key changes, so both the group order and the
 * item order within each group are preserved without re-sorting.
 */
export function groupItemsByMonth(items: NotesFeedItem[]): NotesFeedMonthGroup[] {
  warnIfItemsAreUnsorted(items);

  const groups: NotesFeedMonthGroup[] = [];

  for (const item of items) {
    const key = monthKey(item.date);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.key === key) {
      lastGroup.items.push(item);
    } else {
      groups.push({ key, label: monthLabel(key), items: [item] });
    }
  }

  return groups;
}
