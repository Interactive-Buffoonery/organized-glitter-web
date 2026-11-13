import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hasNewCompletionDate, useCompletionDateStatus } from '../useCompletionDateStatus';

describe('completion date snap-back', () => {
  it('snaps a new date to Completed and restores status when cleared', () => {
    const { result } = renderHook(() => useCompletionDateStatus<string>('completed'));
    expect(result.current.statusForDateChange('2026-01-02', '', 'progress', '')).toBe('completed');
    expect(result.current.statusForStatusChange('wishlist', '2026-01-02', '')).toBe('completed');
    expect(result.current.statusForDateChange('', '2026-01-02', 'completed', '')).toBe('wishlist');
  });
  it('keeps historical dates and deliberate archive and destash choices', () => {
    const { result } = renderHook(() => useCompletionDateStatus<string>('completed'));
    expect(result.current.statusForStatusChange('progress', '2026-01-02', '2026-01-02')).toBe(
      'progress'
    );
    expect(result.current.statusForStatusChange('archived', '2026-01-02', '')).toBe('archived');
    expect(result.current.statusForStatusChange('destashed', '2026-01-02', '')).toBe('destashed');
  });
});

describe('completion date hint eligibility', () => {
  it.each([
    ['2026-01-02', '', true],
    ['2026-01-02', '1/2/2026', false],
    ['', '2026-01-02', false],
    ['2026-01-', '2026-01-02', false],
    ['2026-01-03', '2026-01-02', true],
  ])('compares selected date %s with saved date %s', (current, saved, expected) => {
    expect(hasNewCompletionDate(current, saved)).toBe(expected);
  });
});
