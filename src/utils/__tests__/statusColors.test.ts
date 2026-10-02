import { describe, expect, it } from 'vitest';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { getColoringBookStatusLabel } from '../statusColors';

describe('getColoringBookStatusLabel', () => {
  it('uses bookshelf copy for coloring books that have not been started', () => {
    expect(getColoringBookStatusLabel(ColoringBooksStatusOptions.in_stash)).toBe(
      'On Bookshelf (Not Started)'
    );
  });
});
