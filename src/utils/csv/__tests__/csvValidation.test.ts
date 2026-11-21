/**
 * Regression tests for csvValidation.normalizeStatus.
 *
 * The CSV import pipeline calls validateProjectData() which calls normalizeStatus().
 * Any status enum value omitted from STATUS_MAPPING gets silently rewritten to
 * "wishlist" (line 197-206), which is indistinguishable from the user having
 * typed "wishlist" themselves - classic data-corruption failure mode.
 *
 * Related: PR #143 Codex review (https://github.com/serabi/organized-glitter/pull/143).
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeKitCategory,
  normalizeStatus,
  validateKitCategoryValue,
  validateProjectData,
} from '../csvValidation';

// Pure CSV normalization tests cover invalid values without requiring a backend import.
describe('CSV enum aliases', () => {
  it.each(['constructor', '__proto__', ' Constructor ', ' __PROTO__ ', 'toString'])(
    'rejects inherited object property %j across enum fields',
    value => {
      expect(normalizeStatus(value)).toMatchObject({
        normalized: 'wishlist',
        issue: { field: 'status', originalValue: value, severity: 'warning' },
      });
      expect(validateKitCategoryValue(value)).toBeUndefined();
      expect(normalizeKitCategory(value)).toMatchObject({
        normalized: 'full',
        issue: { field: 'kit_category', originalValue: value, severity: 'warning' },
      });
      const result = validateProjectData({
        title: 'Imported project',
        status: value,
        drillShape: value,
        kitCategory: value,
      });
      expect(result.correctedData).toMatchObject({
        status: 'wishlist',
        drillShape: null,
        kitCategory: 'full',
      });
      expect(result.issues.filter(issue => issue.severity === 'warning')).toHaveLength(3);
    }
  );
});

describe('CSV date validation', () => {
  it.each(['datePurchased', 'dateReceived', 'dateStarted', 'dateCompleted'])(
    'flags an impossible calendar date in %s and keeps the rest of the row',
    field => {
      const result = validateProjectData({
        title: 'Imported project',
        status: 'stash',
        [field]: '2026-02-30',
      });

      expect(result.correctedData).toMatchObject({
        title: 'Imported project',
        status: 'stash',
        [field]: null,
      });
      expect(result.issues).toContainEqual(
        expect.objectContaining({ field, originalValue: '2026-02-30', severity: 'error' })
      );
    }
  );

  it('keeps a real calendar date without an issue', () => {
    const result = validateProjectData({ title: 'Imported project', datePurchased: '2024-02-29' });

    expect(result.correctedData.datePurchased).toBe('2024-02-29');
    expect(result.issues.filter(issue => issue.field === 'datePurchased')).toHaveLength(0);
  });
});
