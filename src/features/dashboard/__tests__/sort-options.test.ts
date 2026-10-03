import { describe, expect, it } from 'vitest';
import { findSortOption } from '../sort-options';

describe('findSortOption', () => {
  it('returns the concrete menu option when the field/direction pair is defined', () => {
    const option = findSortOption('last_updated', 'desc');
    expect(option.label).toBe('Last Updated');
    expect(option.field).toBe('last_updated');
    expect(option.direction).toBe('desc');
  });

  it('synthesizes a truthful label when the pair is not in SORT_OPTION_GROUPS (regression: table headers could sort by company:desc while the summary reported "Last Updated")', () => {
    const option = findSortOption('company', 'desc');
    expect(option.field).toBe('company');
    expect(option.direction).toBe('desc');
    expect(option.label).toContain('Company');
    expect(option.label).not.toBe('Last Updated');
  });

  it('synthesizes a label for status:desc (another table-only sort)', () => {
    const option = findSortOption('status', 'desc');
    expect(option.field).toBe('status');
    expect(option.direction).toBe('desc');
    expect(option.label).toContain('Status');
    expect(option.label).not.toBe('Last Updated');
  });
});
