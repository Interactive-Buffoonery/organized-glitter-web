/**
 * Tests for kit category validation and CSV import parsing.
 * Covers the consolidated validateKitCategoryValue function
 * and end-to-end CSV parsing of kit_category values.
 */

import { describe, it, expect } from 'vitest';
import { validateKitCategoryValue } from '@/utils/csv/csvValidation';

// ─── validateKitCategoryValue (unit) ───────────────────────────────

describe('validateKitCategoryValue', () => {
  it('maps full-kit aliases to "full"', () => {
    const fullAliases = [
      'full drill',
      'full-drill',
      'full sized',
      'full sized kit',
      'full_sized_kit',
      'full coverage',
      'full size',
      'large',
      'big',
    ];

    for (const alias of fullAliases) {
      expect(validateKitCategoryValue(alias)).toBe('full');
    }
  });

  it('returns undefined for unrecognized values', () => {
    expect(validateKitCategoryValue('gobbledygook')).toBeUndefined();
    expect(validateKitCategoryValue('extra large')).toBeUndefined();
    expect(validateKitCategoryValue('medium')).toBeUndefined();
  });
});
