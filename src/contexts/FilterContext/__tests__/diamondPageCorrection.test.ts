import { describe, expect, it } from 'vitest';

import { getDiamondPageCorrection } from '../diamondPageCorrection';

describe('getDiamondPageCorrection', () => {
  it('preserves a page that remains valid after the result count changes', () => {
    expect(
      getDiamondPageCorrection({
        currentPage: 2,
        totalPages: 2,
        isSuccess: true,
        isFetching: false,
        isPlaceholderData: false,
      })
    ).toBeNull();
  });

  it('corrects an out-of-range page only after a successful current response', () => {
    const result = {
      currentPage: 4,
      totalPages: 2,
      isSuccess: true,
      isFetching: false,
      isPlaceholderData: false,
    };
    expect(getDiamondPageCorrection(result)).toBe(2);
    expect(getDiamondPageCorrection({ ...result, isFetching: true })).toBeNull();
    expect(getDiamondPageCorrection({ ...result, isPlaceholderData: true })).toBeNull();
    expect(getDiamondPageCorrection({ ...result, isSuccess: false })).toBeNull();
    expect(getDiamondPageCorrection({ ...result, totalPages: 0 })).toBe(1);
  });
});
