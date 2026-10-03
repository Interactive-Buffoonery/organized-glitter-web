import { describe, expect, it } from 'vitest';

import { DEFAULT_OVERVIEW_SORT, sortOverviewItems } from '../sort-options';
import type { OverviewFeedItem } from '@/services/pocketbase/overview.service';

const item = (overrides: Partial<OverviewFeedItem>): OverviewFeedItem => ({
  id: overrides.id ?? 'item',
  key: overrides.key ?? `diamond-project-${overrides.id ?? 'item'}`,
  kind: overrides.kind ?? 'diamond-project',
  craft: overrides.craft ?? 'diamond',
  title: overrides.title ?? 'Project',
  subtitle: overrides.subtitle ?? 'Diamond painting',
  thumbnailUrl: null,
  statusLabel: 'In progress',
  statusTone: 'progress',
  activityLabel: 'Last progress note Apr 28',
  href: overrides.href ?? '/projects/item',
  sortAt: overrides.sortAt ?? '2026-04-28T00:00:00.000Z',
  sortTitle: overrides.sortTitle ?? overrides.title ?? 'Project',
});

const keys = (items: OverviewFeedItem[]) => items.map(feedItem => feedItem.key);

describe('overview sort options', () => {
  it('preserves recent activity as the default order', () => {
    const items = [
      item({ key: 'older', sortAt: '2026-04-20T00:00:00.000Z' }),
      item({ key: 'newer', sortAt: '2026-04-28T00:00:00.000Z' }),
      item({ key: 'middle', sortAt: '2026-04-24T00:00:00.000Z' }),
    ];

    expect(DEFAULT_OVERVIEW_SORT).toBe('recent_activity');
    expect(keys(sortOverviewItems(items, DEFAULT_OVERVIEW_SORT))).toEqual([
      'newer',
      'middle',
      'older',
    ]);
    expect(keys(items)).toEqual(['older', 'newer', 'middle']);
  });

  it('sorts oldest activity first', () => {
    const items = [
      item({ key: 'newer', sortAt: '2026-04-28T00:00:00.000Z' }),
      item({ key: 'older', sortAt: '2026-04-20T00:00:00.000Z' }),
      item({ key: 'middle', sortAt: '2026-04-24T00:00:00.000Z' }),
    ];

    expect(keys(sortOverviewItems(items, 'oldest_activity'))).toEqual(['older', 'middle', 'newer']);
  });

  it('sorts mixed diamond and coloring items by title A to Z and Z to A', () => {
    const items = [
      item({ key: 'diamond-zinnia', title: 'Zinnia Kit', sortTitle: 'Zinnia Kit' }),
      item({
        key: 'coloring-botanical-12',
        kind: 'coloring-page',
        craft: 'coloring',
        title: 'Page 12',
        sortTitle: 'Botanical Gardens 12',
      }),
      item({
        key: 'coloring-botanical-2',
        kind: 'coloring-page',
        craft: 'coloring',
        title: 'Page 2',
        sortTitle: 'Botanical Gardens 2',
      }),
      item({ key: 'diamond-alpine', title: 'Alpine Cabin', sortTitle: 'Alpine Cabin' }),
    ];

    expect(keys(sortOverviewItems(items, 'name_asc'))).toEqual([
      'diamond-alpine',
      'coloring-botanical-2',
      'coloring-botanical-12',
      'diamond-zinnia',
    ]);
    expect(keys(sortOverviewItems(items, 'name_desc'))).toEqual([
      'diamond-zinnia',
      'coloring-botanical-12',
      'coloring-botanical-2',
      'diamond-alpine',
    ]);
  });

  it('orders equal titles by newest activity and then by key', () => {
    const items = [
      item({
        key: 'same-title-late-b',
        sortTitle: 'Same Title',
        sortAt: '2026-04-28T00:00:00.000Z',
      }),
      item({
        key: 'same-title-late-a',
        sortTitle: 'Same Title',
        sortAt: '2026-04-28T00:00:00.000Z',
      }),
      item({
        key: 'same-title-early',
        sortTitle: 'Same Title',
        sortAt: '2026-04-20T00:00:00.000Z',
      }),
    ];

    expect(keys(sortOverviewItems(items, 'name_asc'))).toEqual([
      'same-title-late-a',
      'same-title-late-b',
      'same-title-early',
    ]);
  });
});
