import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccessibilityAnnouncements } from '../useAccessibilityAnnouncements';

const attachRegions = (result: ReturnType<typeof useAccessibilityAnnouncements>) => {
  result.liveRegionRef.current = document.createElement('div');
  result.statusRef.current = document.createElement('div');
};

describe('useAccessibilityAnnouncements pending writes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(['polite', 'assertive'] as const)(
    'keeps the newest %s announcement when a clear/repopulate write is pending',
    priority => {
      const { result } = renderHook(() => useAccessibilityAnnouncements());
      attachRegions(result.current);
      act(() => {
        result.current.announce('Old message', { priority, clearPrevious: true });
        result.current.announce('New message', { priority });
        vi.advanceTimersByTime(50);
      });
      const region =
        priority === 'polite' ? result.current.liveRegionRef : result.current.statusRef;
      expect(region.current?.textContent).toBe('New message');
    }
  );

  it('cancels both stages when a delayed announcement has begun clearing', () => {
    const { result } = renderHook(() => useAccessibilityAnnouncements());
    attachRegions(result.current);
    act(() => {
      result.current.announce('Old message', { delay: 100, clearPrevious: true });
      vi.advanceTimersByTime(100);
      result.current.announce('New message');
      vi.advanceTimersByTime(50);
    });
    expect(result.current.liveRegionRef.current?.textContent).toBe('New message');
  });

  it('clears pending repopulation on unmount', () => {
    const { result, unmount } = renderHook(() => useAccessibilityAnnouncements());
    attachRegions(result.current);
    act(() => result.current.announce('Old message', { clearPrevious: true }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
