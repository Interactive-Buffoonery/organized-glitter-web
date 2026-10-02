import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSortDividers } from '@/hooks/useSortDividers';
import type { Project as ProjectType, ProjectStatus } from '@/types/project';

const makeProject = (overrides: Partial<ProjectType>): ProjectType =>
  ({
    id: overrides.id ?? 'p',
    userId: 'u',
    title: overrides.title ?? 'Kit',
    status: (overrides.status ?? 'wishlist') as ProjectStatus,
    ...overrides,
  }) as ProjectType;

describe('useSortDividers', () => {
  describe('date sorts', () => {
    it('returns an empty divider list when all projects have the date', () => {
      const projects = [
        makeProject({ id: 'a', datePurchased: '2025-01-01' }),
        makeProject({ id: 'b', datePurchased: '2024-06-15' }),
      ];
      const { result } = renderHook(() => useSortDividers('date_purchased', projects));
      expect(result.current.hasDividers).toBe(false);
      expect(result.current.dividers).toEqual([]);
    });

    it('emits a single divider at the first undated project', () => {
      const projects = [
        makeProject({ id: 'a', datePurchased: '2025-01-01' }),
        makeProject({ id: 'b', datePurchased: '2024-06-15' }),
        makeProject({ id: 'c', datePurchased: '2024-01-01' }),
        makeProject({ id: 'd', datePurchased: undefined }),
        makeProject({ id: 'e', datePurchased: undefined }),
      ];
      const { result } = renderHook(() => useSortDividers('date_purchased', projects));
      expect(result.current.hasDividers).toBe(true);
      expect(result.current.dividers).toHaveLength(1);
      expect(result.current.dividers[0].insertBeforeIndex).toBe(3);
      expect(result.current.dividers[0].isTrailingGroup).toBe(true);
      expect(result.current.dividers[0].label).toContain('no purchase date');
    });

    it('shows "(N total, X on this page)" when undated kits span multiple pages', () => {
      const projects = [
        makeProject({ id: 'a', datePurchased: '2025-01-01' }),
        makeProject({ id: 'b', datePurchased: undefined }),
      ];
      // 16 total undated, only 1 visible on this page (the rest are on other pages)
      const { result } = renderHook(() =>
        useSortDividers('date_purchased', projects, { totalUndatedCount: 16 })
      );
      expect(result.current.dividers[0].label).toContain('16 total');
      expect(result.current.dividers[0].label).toContain('1 on this page');
    });

    it('shows bare "(N kits)" when all undated kits fit on the current page', () => {
      const projects = [
        makeProject({ id: 'a', datePurchased: '2025-01-01' }),
        makeProject({ id: 'b', datePurchased: undefined }),
        makeProject({ id: 'c', datePurchased: undefined }),
      ];
      // total === undatedOnPage (both 2); shouldn't print a redundant "2 on this page"
      const { result } = renderHook(() =>
        useSortDividers('date_purchased', projects, { totalUndatedCount: 2 })
      );
      expect(result.current.dividers[0].label).toBe('Kits with no purchase date (2 kits)');
    });

    it('falls back to "(X on this page)" when no server total is available', () => {
      const projects = [
        makeProject({ id: 'a', datePurchased: '2025-01-01' }),
        makeProject({ id: 'b', datePurchased: undefined }),
      ];
      const { result } = renderHook(() => useSortDividers('date_purchased', projects));
      expect(result.current.dividers[0].label).toContain('1 on this page');
      expect(result.current.dividers[0].label).not.toContain('total');
    });

    it('emits a divider at index 0 when the whole page is undated (continuation header)', () => {
      const projects = [
        makeProject({ id: 'a', datePurchased: undefined }),
        makeProject({ id: 'b', datePurchased: undefined }),
      ];
      const { result } = renderHook(() =>
        useSortDividers('date_purchased', projects, { totalUndatedCount: 16 })
      );
      expect(result.current.hasDividers).toBe(true);
      expect(result.current.dividers).toHaveLength(1);
      expect(result.current.dividers[0].insertBeforeIndex).toBe(0);
      expect(result.current.dividers[0].isTrailingGroup).toBe(true);
      expect(result.current.dividers[0].label).toContain('16 total');
      expect(result.current.dividers[0].label).toContain('2 on this page');
    });
  });

  describe('group-by sorts', () => {
    it('emits a divider at each company boundary', () => {
      const projects = [
        makeProject({ id: 'a', company: 'dimensions' }),
        makeProject({ id: 'b', company: 'dimensions' }),
        makeProject({ id: 'c', company: 'riolis' }),
        makeProject({ id: 'd', company: undefined }),
      ];
      const { result } = renderHook(() => useSortDividers('company', projects));
      expect(result.current.hasDividers).toBe(true);
      expect(result.current.dividers).toHaveLength(3);
      expect(result.current.dividers[0].insertBeforeIndex).toBe(0);
      expect(result.current.dividers[1].insertBeforeIndex).toBe(2);
      expect(result.current.dividers[2].insertBeforeIndex).toBe(3);
      expect(result.current.dividers[2].isTrailingGroup).toBe(true);
      expect(result.current.dividers[2].label).toBe('Kits with no company');
    });

    it('emits a single divider at index 0 when all projects share the same company (continuation header)', () => {
      const projects = [
        makeProject({ id: 'a', company: 'dimensions' }),
        makeProject({ id: 'b', company: 'dimensions' }),
      ];
      const { result } = renderHook(() => useSortDividers('company', projects));
      expect(result.current.hasDividers).toBe(true);
      expect(result.current.dividers).toHaveLength(1);
      expect(result.current.dividers[0].insertBeforeIndex).toBe(0);
      expect(result.current.dividers[0].label).toBe('dimensions');
    });

    it('emits dividers at each status lifecycle boundary', () => {
      const projects = [
        makeProject({ id: 'a', status: 'wishlist' }),
        makeProject({ id: 'b', status: 'purchased' }),
        makeProject({ id: 'c', status: 'kitted' }),
        makeProject({ id: 'd', status: 'completed' }),
      ];
      const { result } = renderHook(() => useSortDividers('status', projects));
      expect(result.current.hasDividers).toBe(true);
      expect(result.current.dividers).toHaveLength(4);
      expect(result.current.dividers[0].label).toBe('Wishlist');
      expect(result.current.dividers[1].label).toBe('Purchased');
      expect(result.current.dividers[2].label).toBe('Kitted Up');
      expect(result.current.dividers[3].label).toBe('Completed');
    });
  });

  describe('no-divider sorts', () => {
    it('returns empty for kit_name', () => {
      const projects = [makeProject({ id: 'a' }), makeProject({ id: 'b' })];
      const { result } = renderHook(() => useSortDividers('kit_name', projects));
      expect(result.current.hasDividers).toBe(false);
    });

    it('returns empty for last_updated', () => {
      const projects = [makeProject({ id: 'a' }), makeProject({ id: 'b' })];
      const { result } = renderHook(() => useSortDividers('last_updated', projects));
      expect(result.current.hasDividers).toBe(false);
    });

    it('returns empty for width', () => {
      const projects = [makeProject({ id: 'a', width: 40 }), makeProject({ id: 'b', width: 60 })];
      const { result } = renderHook(() => useSortDividers('width', projects));
      expect(result.current.hasDividers).toBe(false);
    });
  });

  it('returns empty for an empty projects list', () => {
    const { result } = renderHook(() => useSortDividers('company', []));
    expect(result.current.hasDividers).toBe(false);
    expect(result.current.dividers).toEqual([]);
  });
});
