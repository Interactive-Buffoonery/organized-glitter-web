import { describe, expect, it } from 'vitest';

import type { ColoringMediumRecord } from '@/types/coloringMedium';

import { mergeUpdatedColoringMediumIntoCache } from '../coloringMediumMutationCache';

const medium = (id: string, name: string, type: ColoringMediumRecord['type']) =>
  ({
    id,
    userId: 'user-1',
    name,
    type,
    brand: '',
    colorCount: 0,
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }) satisfies ColoringMediumRecord;

describe('mergeUpdatedColoringMediumIntoCache', () => {
  it('preserves an absent cache entry', () => {
    expect(
      mergeUpdatedColoringMediumIntoCache(
        undefined,
        medium('medium-1', 'Updated', 'colored_pencil')
      )
    ).toBeUndefined();
  });

  it('replaces and resorts an updated medium without changing list metadata', () => {
    const oldMedium = medium('medium-1', 'Old name', 'watercolor');
    const otherMedium = medium('medium-2', 'Pencils', 'colored_pencil');
    const updated = { ...oldMedium, name: 'New name', type: 'acrylic_paint_pen' as const };
    const cached = { items: [oldMedium, otherMedium], totalItems: 2, totalPages: 1 };

    expect(mergeUpdatedColoringMediumIntoCache(cached, updated)).toEqual({
      items: [updated, otherMedium],
      totalItems: 2,
      totalPages: 1,
    });
  });

  it('preserves the cache reference when the medium is absent', () => {
    const cached = {
      items: [medium('medium-2', 'Pencils', 'colored_pencil')],
      totalItems: 1,
      totalPages: 1,
    };

    expect(
      mergeUpdatedColoringMediumIntoCache(cached, medium('missing', 'Missing', 'colored_pencil'))
    ).toBe(cached);
  });
});
