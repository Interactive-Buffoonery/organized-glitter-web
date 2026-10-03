import { describe, expect, it, vi } from 'vitest';
import { groupItemsByMonth } from '../groupItemsByMonth';
import type { NotesFeedItem } from '@/hooks/queries/useNotesFeed';
import type { MarkdownString } from '@/types/markdown';

/**
 * Minimal feed item factory - only `date` and `id` matter for grouping, so the
 * rest is filled with stable placeholder values.
 */
function makeItem(id: string, date: string): NotesFeedItem {
  return {
    id,
    kind: 'diamond',
    content: 'note' as MarkdownString,
    date,
    createdAt: `${date}T10:00:00.000Z`,
    source: {
      id: `src-${id}`,
      title: 'Project',
      detailUrl: `/projects/src-${id}`,
    },
    craftBadgeLabel: 'Diamond Painting',
  };
}

describe('groupItemsByMonth', () => {
  it('returns an empty array for empty input', () => {
    expect(groupItemsByMonth([])).toEqual([]);
  });

  it('places all items of a single month in one group', () => {
    const items = [
      makeItem('a', '2026-05-12'),
      makeItem('b', '2026-05-08'),
      makeItem('c', '2026-05-01'),
    ];

    const groups = groupItemsByMonth(items);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('2026-05');
    expect(groups[0].label).toBe('May 2026');
    expect(groups[0].items.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('splits items into one group per month, newest first', () => {
    const items = [
      makeItem('a', '2026-05-10'),
      makeItem('b', '2026-05-02'),
      makeItem('c', '2026-04-28'),
      makeItem('d', '2026-02-15'),
    ];

    const groups = groupItemsByMonth(items);

    expect(groups.map(group => group.key)).toEqual(['2026-05', '2026-04', '2026-02']);
    expect(groups.map(group => group.label)).toEqual(['May 2026', 'April 2026', 'February 2026']);
    expect(groups[0].items.map(item => item.id)).toEqual(['a', 'b']);
    expect(groups[1].items.map(item => item.id)).toEqual(['c']);
    expect(groups[2].items.map(item => item.id)).toEqual(['d']);
  });

  it('preserves the input order of items within a group', () => {
    const items = [
      makeItem('first', '2026-05-20'),
      makeItem('second', '2026-05-20'),
      makeItem('third', '2026-05-19'),
    ];

    const groups = groupItemsByMonth(items);

    expect(groups[0].items.map(item => item.id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps months in distinct groups across a year boundary', () => {
    const groups = groupItemsByMonth([makeItem('a', '2026-01-04'), makeItem('b', '2025-12-30')]);

    expect(groups.map(group => group.key)).toEqual(['2026-01', '2025-12']);
    expect(groups.map(group => group.label)).toEqual(['January 2026', 'December 2025']);
  });

  it('derives the month from full ISO timestamps', () => {
    const groups = groupItemsByMonth([makeItem('a', '2026-03-09T14:30:00.000Z')]);

    expect(groups[0].key).toBe('2026-03');
    expect(groups[0].label).toBe('March 2026');
  });

  it('does not drift a first-of-month date-only string into the prior month', () => {
    const groups = groupItemsByMonth([makeItem('a', '2026-06-01')]);

    expect(groups[0].key).toBe('2026-06');
  });

  it('warns in development when items are not sorted newest first', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      groupItemsByMonth([
        makeItem('older', '2026-05-01'),
        makeItem('newer', '2026-05-08'),
        makeItem('prior-month', '2026-04-30'),
      ]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('groupItemsByMonth: items are not sorted newest-first');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
