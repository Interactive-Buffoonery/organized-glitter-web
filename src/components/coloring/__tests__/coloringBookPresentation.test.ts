import { describe, expect, it } from 'vitest';
import {
  formatColoringBookDate,
  getColoringBookFormatLabel,
  getColoringProgressLabel,
} from '../coloringBookPresentation';
import type { ColoringBookCardData } from '../coloringBookCardTypes';

describe('formatColoringBookDate', () => {
  it('formats date-only book dates without shifting to the previous day', () => {
    expect(formatColoringBookDate('2026-05-08')).toBe('5/8/2026');
  });
});

describe('getColoringBookFormatLabel', () => {
  it('labels paperback values as softcover and labels hardcover records', () => {
    expect(getColoringBookFormatLabel({ bookFormat: 'paperback' })).toBe('Softcover');
    expect(getColoringBookFormatLabel({ bookFormat: 'hardcover' })).toBe('Hardcover');
  });
});

describe('getColoringProgressLabel', () => {
  it.each([
    [1, '0 of 1 page'],
    [2, '0 of 2 pages'],
  ] as const)('uses the right unit for %s total pages', (totalPages, expected) => {
    expect(
      getColoringProgressLabel({ totalPages, completedPages: 0 } as ColoringBookCardData)
    ).toBe(expected);
  });
});
