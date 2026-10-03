import { describe, expect, it } from 'vitest';
import { formatColoringBookDate, getColoringBookFormatLabel } from '../coloringBookPresentation';

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
