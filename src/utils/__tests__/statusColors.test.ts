import { describe, expect, it } from 'vitest';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { getColoringBookStatusLabel } from '../statusColors';

describe('getColoringBookStatusLabel', () => {
  it('uses library copy for coloring books that have not been started', () => {
    expect(getColoringBookStatusLabel(ColoringBooksStatusOptions.in_stash)).toBe('In library');
  });
});
