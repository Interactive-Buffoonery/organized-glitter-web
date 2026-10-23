import { describe, it, expect } from 'vitest';
import { queryKeys } from '../queryKeys';
import type { ProjectQueryParams } from '../queryKeys';
import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';

describe('queryKeys', () => {
  describe('stable key serialization', () => {
    const baseParams: ProjectQueryParams = {
      filters: {} as ProjectQueryParams['filters'],
      sortField: 'updated' as DashboardValidSortField,
      sortDirection: 'desc',
      currentPage: 1,
      pageSize: 20,
    };

    it('should produce identical project keys for equivalent object property order', () => {
      const key1 = queryKeys.projects.list('user-1', {
        ...baseParams,
        filters: {
          selectedTags: ['tag-b', 'tag-a'],
          company: 'dac',
        } as ProjectQueryParams['filters'],
      });
      const key2 = queryKeys.projects.list('user-1', {
        pageSize: 20,
        currentPage: 1,
        sortDirection: 'desc',
        sortField: 'updated' as DashboardValidSortField,
        filters: {
          company: 'dac',
          selectedTags: ['tag-a', 'tag-b'],
        } as ProjectQueryParams['filters'],
      });

      expect(key1).toEqual(key2);
    });
  });

  describe('progress notes', () => {
    it('should isolate notes feed keys by year, image filter, and user', () => {
      const baseKey = queryKeys.notesFeed.list('user-123', {
        craft: 'diamond',
        sourceId: 'project-1',
        year: 2026,
        hasImage: true,
      });
      const differentYearKey = queryKeys.notesFeed.list('user-123', {
        craft: 'diamond',
        sourceId: 'project-1',
        year: 2025,
        hasImage: true,
      });
      const differentImageKey = queryKeys.notesFeed.list('user-123', {
        craft: 'diamond',
        sourceId: 'project-1',
        year: 2026,
        hasImage: false,
      });
      const differentUserKey = queryKeys.notesFeed.list('user-456', {
        craft: 'diamond',
        sourceId: 'project-1',
        year: 2026,
        hasImage: true,
      });

      expect(baseKey).not.toEqual(differentYearKey);
      expect(baseKey).not.toEqual(differentImageKey);
      expect(baseKey).not.toEqual(differentUserKey);
      expect(JSON.stringify(baseKey)).not.toContain('user-123');
    });
  });

  describe('tags', () => {
    it('should not mutate caller-owned tag ID arrays', () => {
      const tagIds = ['tag-b', 'tag-a'];

      queryKeys.tags.stat('user-1', tagIds);
      queryKeys.coloring.tags.stat('user-1', tagIds);

      expect(tagIds).toEqual(['tag-b', 'tag-a']);
    });
  });
});
