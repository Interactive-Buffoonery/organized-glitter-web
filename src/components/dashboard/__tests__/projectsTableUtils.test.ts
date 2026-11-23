import { describe, expect, it } from 'vitest';
import type { ProjectType } from '@/types/project';
import { getLifecycleDate } from '../projectsTableUtils';

const wishlistKit = {
  id: 'kit',
  title: 'Wishlist kit',
  status: 'wishlist',
  createdAt: '2026-11-21',
  datePurchased: '2025-10-26',
} as ProjectType;

describe('getLifecycleDate', () => {
  it('shows the added date for wishlist kits by default', () => {
    expect(getLifecycleDate(wishlistKit)).toEqual({ label: 'Added', value: '11/21/2026' });
  });

  it('shows the purchase date when sorting by purchase date', () => {
    expect(getLifecycleDate(wishlistKit, 'date_purchased')).toEqual({
      label: 'Purchased',
      value: '10/26/2025',
    });
  });

  it('falls back to the default date when sorting by purchase date without one', () => {
    expect(
      getLifecycleDate({ ...wishlistKit, datePurchased: undefined }, 'date_purchased')
    ).toEqual({ label: 'Added', value: '11/21/2026' });
  });
});
