import { describe, it, expect } from 'vitest';
import { queryKeys } from '../queryKeys';
import type { DashboardStatusCountsParams, ProjectQueryParams } from '../queryKeys';
import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';

describe('queryKeys', () => {
  describe('hierarchical structure', () => {
    it('should have base keys for all resource types', () => {
      expect(queryKeys.projects.all).toEqual(['projects']);
      expect(queryKeys.companies.all).toEqual(['companies']);
      expect(queryKeys.artists.all).toEqual(['artists']);
      expect(queryKeys.tags.all).toEqual(['tags']);
      expect(queryKeys.progressNotes.all).toEqual(['progressNotes']);
      expect(queryKeys.notesFeed.all).toEqual(['notesFeed']);
      expect(queryKeys.noteTargets.all).toEqual(['noteTargets']);
      expect(queryKeys.user.all).toEqual(['user']);
      expect(queryKeys.stats.all).toEqual(['stats']);
    });

    it('should build list keys from base keys', () => {
      expect(queryKeys.projects.lists()).toEqual(['projects', 'list']);
      expect(queryKeys.companies.lists()).toEqual(['companies', 'list']);
      expect(queryKeys.artists.lists()).toEqual(['artists', 'list']);
      expect(queryKeys.tags.lists()).toEqual(['tags', 'list']);
      expect(queryKeys.progressNotes.lists()).toEqual(['progressNotes', 'list']);
      expect(queryKeys.notesFeed.lists()).toEqual(['notesFeed', 'list']);
      expect(queryKeys.noteTargets.lists()).toEqual(['noteTargets', 'list']);
    });

    it('should build detail keys from base keys', () => {
      expect(queryKeys.projects.details()).toEqual(['projects', 'detail']);
      expect(queryKeys.projects.detail('abc')).toEqual(['projects', 'detail', 'abc']);
    });
  });

  describe('user key hashing', () => {
    it('should hash user IDs consistently', () => {
      const key1 = queryKeys.user.profile('user-123');
      const key2 = queryKeys.user.profile('user-123');
      expect(key1).toEqual(key2);
    });

    it('should produce different hashes for different users', () => {
      const key1 = queryKeys.user.profile('user-a');
      const key2 = queryKeys.user.profile('user-b');
      expect(key1[2]).not.toEqual(key2[2]);
    });

    it('should use "guest" for empty or guest user IDs', () => {
      const guestKey = queryKeys.user.profile('guest');
      expect(guestKey[2]).toBe('guest');

      const emptyKey = queryKeys.user.profile('');
      expect(emptyKey[2]).toBe('guest');
    });
  });

  describe('stable key serialization', () => {
    const baseParams: ProjectQueryParams = {
      filters: {} as ProjectQueryParams['filters'],
      sortField: 'updated' as DashboardValidSortField,
      sortDirection: 'desc',
      currentPage: 1,
      pageSize: 20,
    };

    it('should produce identical keys for identical params', () => {
      const key1 = queryKeys.projects.list('user-1', { ...baseParams });
      const key2 = queryKeys.projects.list('user-1', { ...baseParams });
      expect(key1).toEqual(key2);
    });

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

    it('should produce different keys for different params', () => {
      const key1 = queryKeys.projects.list('user-1', { ...baseParams, currentPage: 1 });
      const key2 = queryKeys.projects.list('user-1', { ...baseParams, currentPage: 2 });
      expect(key1).not.toEqual(key2);
    });

    it('should keep dashboard status-count keys stable across status and paging changes', () => {
      const filters: DashboardStatusCountsParams['filters'] = {
        company: 'dac',
        artist: 'artist-1',
        drillShape: 'square',
        yearFinished: '2026',
        includeMiniKits: true,
        searchTerm: 'winter',
        searchAllFields: false,
        selectedTags: ['tag-b', 'tag-a'],
      };

      const key1 = queryKeys.projects.statusCounts('user-1', { filters });
      const key2 = queryKeys.projects.statusCounts('user-1', {
        filters: {
          ...filters,
          selectedTags: ['tag-a', 'tag-b'],
        },
      });

      expect(key1).toEqual(key2);
    });

    it('should produce different dashboard status-count keys when non-status filters change', () => {
      const key1 = queryKeys.projects.statusCounts('user-1', {
        filters: {
          company: 'dac',
          artist: 'artist-1',
          drillShape: 'square',
          yearFinished: '2026',
          includeMiniKits: true,
          searchTerm: 'winter',
          searchAllFields: false,
          selectedTags: ['tag-a'],
        },
      });
      const key2 = queryKeys.projects.statusCounts('user-1', {
        filters: {
          company: 'dac',
          artist: 'artist-1',
          drillShape: 'square',
          yearFinished: '2026',
          includeMiniKits: true,
          searchTerm: 'spring',
          searchAllFields: false,
          selectedTags: ['tag-a'],
        },
      });

      expect(key1).not.toEqual(key2);
    });

    it('should hash user IDs for undated count keys', () => {
      const key = queryKeys.projects.undatedCount('user-1', {
        sentinelField: 'date_purchased_has_value',
        filters: {
          status: 'everything',
          selectedTags: ['tag-b', 'tag-a'],
        },
      });

      expect(key[3]).not.toBe('user-1');
      expect(JSON.stringify(key)).not.toContain('user-1');
    });
  });

  describe('progress notes', () => {
    it('should scope by project ID', () => {
      const key = queryKeys.progressNotes.list('project-abc');
      expect(key).toEqual(['progressNotes', 'list', 'project-abc']);
    });

    it('should scope coloring page progress notes by page ID', () => {
      const key = queryKeys.coloring.pageProgressNotes.list('page-abc');
      expect(key).toEqual(['coloring-page-progress-notes', 'list', 'page-abc']);
    });

    it('should build stable notes feed keys with hashed user IDs and filters', () => {
      const key1 = queryKeys.notesFeed.list('user-1', {
        projectId: 'project-abc',
        year: 2026,
        hasImage: true,
      });
      const key2 = queryKeys.notesFeed.list('user-1', {
        hasImage: true,
        year: 2026,
        projectId: 'project-abc',
      });
      const key3 = queryKeys.notesFeed.list('user-2', {
        projectId: 'project-abc',
        year: 2026,
        hasImage: true,
      });

      expect(key1).toEqual(key2);
      expect(key1[2]).not.toBe('user-1');
      expect(key1[2]).not.toEqual(key3[2]);
    });

    it('should isolate notes feed keys by craft and source', () => {
      const allKey = queryKeys.notesFeed.list('user-123', { craft: 'all' });
      const coloringKey = queryKeys.notesFeed.list('user-123', { craft: 'coloring' });
      const coloringSourceKey = queryKeys.notesFeed.list('user-123', {
        craft: 'coloring',
        sourceId: 'book-1',
      });

      expect(allKey).not.toEqual(coloringKey);
      expect(coloringKey).not.toEqual(coloringSourceKey);
    });

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

    it('should build stable note target keys with normalized search and vertical flags', () => {
      const key1 = queryKeys.noteTargets.list('user-123', {
        searchTerm: ' winter ',
        diamondEnabled: true,
        coloringEnabled: false,
      });
      const key2 = queryKeys.noteTargets.list('user-123', {
        searchTerm: 'winter',
        coloringEnabled: false,
        diamondEnabled: true,
      });
      const diamondDisabledKey = queryKeys.noteTargets.list('user-123', {
        searchTerm: 'winter',
        diamondEnabled: false,
        coloringEnabled: false,
      });
      const coloringEnabledKey = queryKeys.noteTargets.list('user-123', {
        searchTerm: 'winter',
        diamondEnabled: true,
        coloringEnabled: true,
      });

      expect(key1).toEqual(key2);
      expect(key1).not.toEqual(diamondDisabledKey);
      expect(key1).not.toEqual(coloringEnabledKey);
      expect(key1[2]).not.toBe('user-123');
      expect(JSON.stringify(key1)).not.toContain('user-123');
    });

    it('should build note target pages-for-book keys by user and book', () => {
      const key = queryKeys.noteTargets.pagesForBook('user-123', 'book-1');
      const otherBookKey = queryKeys.noteTargets.pagesForBook('user-123', 'book-2');

      expect(key).toEqual(['noteTargets', 'pages-for-book', expect.any(String), 'book-1']);
      expect(key).not.toEqual(otherBookKey);
      expect(key[2]).not.toBe('user-123');
    });
  });

  describe('stats', () => {
    it('should hash user IDs for stats query keys', () => {
      const key = queryKeys.stats.summary('user-1', 2026);

      expect(key[0]).toBe('stats');
      expect(key[1]).toBe('summary');
      expect(key[2]).not.toBe('user-1');
      expect(key[3]).toBe(2026);
    });

    it('should vary completion-by-month keys only by user and year', () => {
      const key1 = queryKeys.stats.completionsByMonth('user-1', 2026);
      const key2 = queryKeys.stats.completionsByMonth('user-1', 2026);
      const differentYear = queryKeys.stats.completionsByMonth('user-1', 2025);
      const differentUser = queryKeys.stats.completionsByMonth('user-2', 2026);

      expect(key1).toEqual(key2);
      expect(key1).not.toEqual(differentYear);
      expect(key1).not.toEqual(differentUser);
    });

    it('should vary coloring stats keys by user and selected year', () => {
      const key1 = queryKeys.stats.coloringSummary('user-1', 2026);
      const key2 = queryKeys.stats.coloringSummary('user-1', 2026);
      const differentYear = queryKeys.stats.coloringSummary('user-1', 2025);
      const differentUser = queryKeys.stats.coloringSummary('user-2', 2026);

      expect(key1).toEqual(key2);
      expect(key1).not.toEqual(differentYear);
      expect(key1).not.toEqual(differentUser);
    });
  });

  describe('tags', () => {
    it('should build stat keys with sorted tag IDs', () => {
      const key1 = queryKeys.tags.stat('user-1', ['tag-b', 'tag-a']);
      const key2 = queryKeys.tags.stat('user-1', ['tag-a', 'tag-b']);
      expect(key1[3]).toEqual(key2[3]);
    });

    it('should not mutate caller-owned tag ID arrays', () => {
      const tagIds = ['tag-b', 'tag-a'];

      queryKeys.tags.stat('user-1', tagIds);
      queryKeys.coloring.tags.stat('user-1', tagIds);

      expect(tagIds).toEqual(['tag-b', 'tag-a']);
    });

    it('should build coloring tag stat keys with sorted tag IDs', () => {
      const key1 = queryKeys.coloring.tags.stat('user-1', ['tag-b', 'tag-a']);
      const key2 = queryKeys.coloring.tags.stat('user-1', ['tag-a', 'tag-b']);

      expect(key1[3]).toEqual(key2[3]);
    });
  });

  describe('coloring list keys', () => {
    it('should build stable coloring book list keys', () => {
      const key1 = queryKeys.coloring.books.list({
        userId: 'user-1',
        page: 1,
        perPage: 24,
        filter: 'status = "in_progress"',
        sort: '-updated',
      });
      const key2 = queryKeys.coloring.books.list({
        sort: '-updated',
        filter: 'status = "in_progress"',
        perPage: 24,
        page: 1,
        userId: 'user-1',
      });

      expect(key1).toEqual(key2);
    });

    it('should build stable coloring page list keys', () => {
      const key1 = queryKeys.coloring.pages.list({
        bookId: 'book-1',
        page: 1,
        perPage: 50,
        filter: 'status = "completed"',
        sort: 'page_number',
      });
      const key2 = queryKeys.coloring.pages.list({
        sort: 'page_number',
        filter: 'status = "completed"',
        perPage: 50,
        page: 1,
        bookId: 'book-1',
      });

      expect(key1).toEqual(key2);
    });
  });
});
