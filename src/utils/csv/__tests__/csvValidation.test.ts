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
import { ProjectsStatusOptions } from '@/types/pocketbase.types';

describe('normalizeStatus', () => {
  it('preserves kitted status for the canonical lowercase value', () => {
    const result = normalizeStatus('kitted');
    expect(result.normalized).toBe(ProjectsStatusOptions.kitted);
  });

  it('preserves kitted status for the common display-label variation', () => {
    const result = normalizeStatus('Kitted Up, Not Started');
    expect(result.normalized).toBe(ProjectsStatusOptions.kitted);
  });

  it('preserves kitted status for the short display-label variation', () => {
    const result = normalizeStatus('Kitted Up');
    expect(result.normalized).toBe(ProjectsStatusOptions.kitted);
  });

  it('preserves kitted status for the "ready to start" alias', () => {
    const result = normalizeStatus('ready to start');
    expect(result.normalized).toBe(ProjectsStatusOptions.kitted);
  });

  it('maps every ProjectsStatusOptions value to itself when that value is passed in', () => {
    // Exhaustiveness check: every enum value must survive a round-trip through
    // normalizeStatus. This catches the case where a new status is added to
    // the enum but its STATUS_MAPPING entry is forgotten.
    for (const status of Object.values(ProjectsStatusOptions)) {
      const { normalized } = normalizeStatus(status);
      expect(normalized, `status "${status}" was silently rewritten`).toBe(status);
    }
  });
});

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

  it.each(['constructor', '__proto__'])(
    'clears inherited drill shape %j and reports its warning',
    drillShape => {
      const result = validateProjectData({ title: 'Imported project', drillShape });
      expect(result.correctedData.drillShape).toBeNull();
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          field: 'drill_shape',
          originalValue: drillShape,
          severity: 'warning',
        })
      );
    }
  );

  it.each(['constructor', '__proto__'])(
    'rejects inherited kit category %j in the direct predicate',
    value => {
      expect(validateKitCategoryValue(value)).toBeUndefined();
    }
  );

  it.each(['constructor', '__proto__'])(
    'defaults inherited kit category %j with a warning',
    value => {
      expect(normalizeKitCategory(value)).toMatchObject({
        normalized: 'full',
        issue: { field: 'kit_category', originalValue: value, severity: 'warning' },
      });
    }
  );

  it('preserves ordinary aliases, canonical values, and empty defaults', () => {
    const result = validateProjectData({
      title: 'Imported project',
      status: ' In Progress ',
      drillShape: ' S ',
      kitCategory: ' Mini Kit ',
    });
    expect(result.correctedData).toMatchObject({
      status: 'progress',
      drillShape: 'square',
      kitCategory: 'mini',
    });
    expect(result.issues.map(issue => issue.severity)).toEqual(['info', 'info', 'info']);
    expect(normalizeStatus('wishlist')).toEqual({ normalized: 'wishlist', issue: undefined });
    expect(normalizeKitCategory('full')).toEqual({ normalized: 'full', issue: undefined });
    expect(normalizeStatus('')).toEqual({ normalized: 'wishlist' });
    expect(normalizeKitCategory('')).toEqual({ normalized: 'full' });
    expect(validateKitCategoryValue('')).toBeUndefined();
  });
});
