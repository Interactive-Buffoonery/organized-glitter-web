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
