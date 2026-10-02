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
import { normalizeStatus } from '../csvValidation';
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
