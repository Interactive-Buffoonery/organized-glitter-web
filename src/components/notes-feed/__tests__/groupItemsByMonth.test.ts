import { describe, expect, it } from 'vitest';
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
  it('keeps months in distinct groups across a year boundary', () => {
    const groups = groupItemsByMonth([makeItem('a', '2026-01-04'), makeItem('b', '2025-12-30')]);

    expect(groups.map(group => group.key)).toEqual(['2026-01', '2025-12']);
    expect(groups.map(group => group.label)).toEqual(['January 2026', 'December 2025']);
  });

  it('does not drift a first-of-month date-only string into the prior month', () => {
    const groups = groupItemsByMonth([makeItem('a', '2026-06-01')]);

    expect(groups[0].key).toBe('2026-06');
  });
});
