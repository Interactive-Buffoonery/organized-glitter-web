/**
 * Tests for ProjectsService
 * Covers: filter construction, search modes, status counts, pagination,
 * record transformation, ownership checks, CRUD operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pbMock = vi.hoisted(() => {
  const createListResult = (items: unknown[] = [], totalItems?: number) => ({
    page: 1,
    perPage: Math.max(items.length, 1),
    totalItems: totalItems ?? items.length,
    totalPages: items.length > 0 ? 1 : 0,
    items,
  });

  const collectionMethods = {
    getOne: vi.fn(),
    getList: vi.fn().mockResolvedValue(createListResult()),
    getFullList: vi.fn().mockResolvedValue([]),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      send: vi.fn(),
      filter: vi.fn((expr: string, params?: Record<string, unknown>) => {
        // Return a string that embeds param values for testability
        if (!params) return expr;
        let result = expr;
        for (const [key, value] of Object.entries(params)) {
          result = result.replace(`{:${key}}`, String(value));
        }
        return result;
      }),
    },
    collectionMethods,
    createListResult,
    reset: () => {
      Object.values(collectionMethods).forEach(m => m.mockReset());
      collectionMethods.getList.mockResolvedValue(createListResult());
      collectionMethods.getFullList.mockResolvedValue([]);
      collectionMethods.delete.mockResolvedValue(true);
      pbMock.pb.send.mockReset();
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({ pb: pbMock.pb }));
vi.mock('@/services/auth', () => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'user-123'),
}));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
  }),
  batchApiLogger: {
    startBatchOperation: vi.fn(() => 'batch-1'),
    endBatchOperation: vi.fn(),
  },
}));
import { ProjectsService } from '../projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(() => {
    pbMock.reset();
    service = new ProjectsService({ enablePerformanceLogging: false });
  });

  // ── Status counts ─────────────────────────────────────────────────

  describe('getBatchStatusCounts()', () => {
    it('uses getFullList to count ALL projects without truncation', async () => {
      const items = Array.from({ length: 2500 }, (_, i) => ({
        status: i % 3 === 0 ? 'wishlist' : i % 3 === 1 ? 'progress' : 'completed',
      }));
      pbMock.collectionMethods.getFullList.mockResolvedValue(items);

      const result = await service.getBatchStatusCounts({ userId: 'user-123' });

      expect(pbMock.collectionMethods.getFullList).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(2500);
      // Verify counts match
      expect(result.counts.wishlist).toBe(834);
      expect(result.counts.progress).toBe(833);
      expect(result.counts.completed).toBe(833);
    });

    it('only requests the status field for efficiency', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([]);

      await service.getBatchStatusCounts({ userId: 'user-123' });

      const callArgs = pbMock.collectionMethods.getFullList.mock.calls[0][0];
      expect(callArgs.fields).toBe('status');
    });

    it('counts all valid status types', async () => {
      const items = [
        { status: 'wishlist' },
        { status: 'purchased' },
        { status: 'stash' },
        { status: 'kitted' },
        { status: 'progress' },
        { status: 'onhold' },
        { status: 'completed' },
        { status: 'archived' },
        { status: 'destashed' },
      ];
      pbMock.collectionMethods.getFullList.mockResolvedValue(items);

      const result = await service.getBatchStatusCounts({ userId: 'user-123' });

      expect(result.total).toBe(9);
      expect(result.counts.wishlist).toBe(1);
      expect(result.counts.purchased).toBe(1);
      expect(result.counts.stash).toBe(1);
      expect(result.counts.kitted).toBe(1);
      expect(result.counts.progress).toBe(1);
      expect(result.counts.onhold).toBe(1);
      expect(result.counts.completed).toBe(1);
      expect(result.counts.archived).toBe(1);
      expect(result.counts.destashed).toBe(1);
    });

    it('filters by userId', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([]);

      await service.getBatchStatusCounts({ userId: 'user-456' });

      const callArgs = pbMock.collectionMethods.getFullList.mock.calls[0][0];
      expect(callArgs.filter).toContain('user-456');
    });

    it('can skip archived and destashed checkbox exclusions for chip counts', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([]);

      await service.getBatchStatusCounts(
        {
          userId: 'user-456',
          includeArchived: false,
          includeDestashed: false,
        },
        {
          skipStatusExclusionCheckboxes: true,
        }
      );

      const callArgs = pbMock.collectionMethods.getFullList.mock.calls[0][0];
      expect(callArgs.filter).not.toContain('destashed');
      expect(callArgs.filter).not.toContain('archived');
    });
  });

  describe('stats endpoints', () => {
    it('fetches the server-side stats summary endpoint', async () => {
      const response = {
        generatedAt: '2026-05-02T12:00:00.000Z',
        year: 2026,
        metrics: {
          totalKits: 10,
          completedThisYear: 2,
          inProgress: 1,
          allTimeCompleted: 5,
          wishlistSize: 1,
        },
        statusBreakdown: {
          wishlist: 1,
          purchased: 1,
          stash: 1,
          kitted: 1,
          progress: 1,
          onhold: 0,
          completed: 5,
          archived: 0,
          destashed: 0,
        },
      };
      pbMock.pb.send.mockResolvedValue(response);

      await expect(service.getStatsSummary(2026)).resolves.toEqual(response);

      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/summary', {
        method: 'GET',
        query: { year: 2026 },
      });
    });

    it('fetches monthly completions for the requested year', async () => {
      const response = {
        generatedAt: '2026-05-02T12:00:00.000Z',
        year: 2026,
        total: 0,
        months: [],
      };
      pbMock.pb.send.mockResolvedValue(response);

      await expect(service.getCompletionsByMonth(2026)).resolves.toEqual(response);

      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/completions', {
        method: 'GET',
        query: { year: 2026 },
      });
    });

    it('fetches yearly completions from the server-side stats endpoint', async () => {
      const response = {
        generatedAt: '2026-05-02T12:00:00.000Z',
        total: 3,
        years: [{ year: 2026, count: 3, cumulativeCount: 3 }],
      };
      pbMock.pb.send.mockResolvedValue(response);

      await expect(service.getCompletionsYearly()).resolves.toEqual(response);

      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/completions/yearly', {
        method: 'GET',
      });
    });

    it('fetches completion time stats from the server-side stats endpoint', async () => {
      const response = {
        generatedAt: '2026-05-02T12:00:00.000Z',
        averageCompletionDays: 14,
        averageStashDwellDays: null,
        averageTimeToStartDays: null,
        fastestCompletion: null,
        slowestCompletion: null,
        mostProductiveMonth: null,
      };
      pbMock.pb.send.mockResolvedValue(response);

      await expect(service.getCompletionTimeStats()).resolves.toEqual(response);

      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/completion-times', {
        method: 'GET',
      });
    });

    it('fetches collection stats from the server-side stats endpoint', async () => {
      const response = {
        generatedAt: '2026-05-02T12:00:00.000Z',
        topCompanies: [],
        topCompaniesGroup: { total: 0, items: [], otherCount: 0 },
        topArtists: [],
        topArtistsGroup: { total: 0, items: [], otherCount: 0 },
        topTags: [],
        topTagsGroup: { total: 0, items: [], otherCount: 0 },
        drillShapeSplit: [],
        kitCategorySplit: [],
        sizeBuckets: [],
      };
      pbMock.pb.send.mockResolvedValue(response);

      await expect(service.getCollectionStats()).resolves.toEqual(response);

      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/collection', {
        method: 'GET',
      });
    });

    it('fetches month in review with query params', async () => {
      const response = {
        generatedAt: '2026-05-02T12:00:00.000Z',
        year: 2026,
        month: 5,
        label: 'May 2026',
        completedKits: [],
        progressNotes: [],
        newAdditions: [],
      };
      pbMock.pb.send.mockResolvedValue(response);

      await expect(service.getMonthInReview(2026, 5)).resolves.toEqual(response);

      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/month-in-review', {
        method: 'GET',
        query: { year: 2026, month: 5 },
      });
    });

    it('surfaces stats endpoint errors through the service error handler', async () => {
      pbMock.pb.send.mockRejectedValue(new Error('stats unavailable'));

      await expect(service.getStatsSummary()).rejects.toMatchObject({
        message: 'stats unavailable',
        type: 'server',
      });
    });
  });

  // ── Record transformation ─────────────────────────────────────────

  describe('getProjects(): record transformation', () => {
    const makeRecord = (overrides: Record<string, unknown> = {}) => ({
      id: 'proj-1',
      user: 'user-123',
      title: 'Test Kit',
      company: 'comp-1',
      artist: 'art-1',
      status: 'progress',
      kit_category: 'full',
      drill_shape: 'round',
      date_purchased: '2024-01-15',
      date_received: '2024-02-01',
      date_started: '2024-03-01',
      date_completed: '',
      width: 40,
      height: 50,
      total_diamonds: 25000,
      general_notes: 'A nice kit',
      image: 'photo.jpg',
      source_url: 'https://example.com',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-06-01T00:00:00Z',
      expand: {},
      ...overrides,
    });

    it('transforms PocketBase record to Project type with camelCase fields', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([makeRecord()], 1)
      );
      // Status counts call
      pbMock.collectionMethods.getFullList.mockResolvedValue([{ status: 'progress' }]);

      const companyMap = new Map([['comp-1', 'Diamond Art Club']]);
      const artistMap = new Map([['art-1', 'Josephine Wall']]);

      const result = await service.getProjects(
        {
          filters: { userId: 'user-123', status: 'progress' },
          sort: { field: 'last_updated', direction: 'desc' },
          page: 1,
          pageSize: 20,
          includeStatusCounts: false,
        },
        companyMap,
        artistMap
      );

      const project = result.projects[0];
      expect(project.id).toBe('proj-1');
      expect(project.userId).toBe('user-123');
      expect(project.title).toBe('Test Kit');
      expect(project.company).toBe('Diamond Art Club');
      expect(project.artist).toBe('Josephine Wall');
      expect(project.status).toBe('progress');
      expect(project.kitCategory).toBe('full');
      expect(project.drillShape).toBe('round');
      expect(project.datePurchased).toBe('2024-01-15');
      expect(project.width).toBe(40);
      expect(project.height).toBe(50);
      expect(project.imageUrl).toBe('photo.jpg');
      expect(project.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(project.updatedAt).toBe('2024-06-01T00:00:00Z');
    });

    it('leaves company and artist undefined when lookup maps are not provided', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([makeRecord()], 1)
      );

      const result = await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      expect(result.projects[0].company).toBeUndefined();
      expect(result.projects[0].artist).toBeUndefined();
    });

    it('transforms tag expand data into Tag objects', async () => {
      const record = makeRecord({
        expand: {
          project_tags_via_project: [
            {
              id: 'pt-1',
              expand: {
                tag: {
                  id: 'tag-1',
                  user: 'user-123',
                  name: 'Favorites',
                  slug: 'favorites',
                  color: '#ff0000',
                  created: '2024-01-01',
                  updated: '2024-01-01',
                },
              },
            },
          ],
        },
      });
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([record], 1));

      const result = await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      expect(result.projects[0].tags).toHaveLength(1);
      expect(result.projects[0].tags[0]).toEqual({
        id: 'tag-1',
        userId: 'user-123',
        name: 'Favorites',
        slug: 'favorites',
        color: '#ff0000',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });
    });

    it('treats skipTotal full-page search results as an estimated total', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue({
        page: 1,
        perPage: 2,
        totalItems: -1,
        totalPages: 1,
        items: [makeRecord(), makeRecord({ id: 'proj-2', title: 'Second Kit' })],
      });

      const result = await service.getProjects({
        filters: { userId: 'user-123', searchTerm: 'sparkle' },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 1,
        pageSize: 2,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.skipTotal).toBe(true);
      expect(result.totalItems).toBe(2);
      expect(result.totalItemsIsEstimate).toBe(true);
      expect(result.totalPages).toBe(2);
    });

    it('treats skipTotal partial-page search results as exact for the current page', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue({
        page: 1,
        perPage: 2,
        totalItems: -1,
        totalPages: 1,
        items: [makeRecord()],
      });

      const result = await service.getProjects({
        filters: { userId: 'user-123', searchTerm: 'sparkle' },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 1,
        pageSize: 2,
        includeStatusCounts: false,
      });

      expect(result.totalItems).toBe(1);
      expect(result.totalItemsIsEstimate).toBe(false);
      expect(result.totalPages).toBe(1);
    });

    it('counts only an empty deep-search page beyond page one to find the real bound', async () => {
      pbMock.collectionMethods.getList
        .mockResolvedValueOnce({
          page: 999,
          perPage: 25,
          totalItems: -1,
          totalPages: 999,
          items: [],
        })
        .mockResolvedValueOnce({
          page: 999,
          perPage: 25,
          totalItems: 52,
          totalPages: 3,
          items: [],
        });

      const result = await service.getProjects({
        filters: { userId: 'user-123', searchTerm: 'sparkle', searchAllFields: true },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 999,
        pageSize: 25,
        includeStatusCounts: false,
      });

      expect(pbMock.collectionMethods.getList).toHaveBeenCalledTimes(2);
      expect(pbMock.collectionMethods.getList.mock.calls[0][2].skipTotal).toBe(true);
      expect(pbMock.collectionMethods.getList.mock.calls[1][2].skipTotal).toBe(false);
      expect(result.totalPages).toBe(3);
      expect(result.totalItems).toBe(52);
    });

    it('keeps a partial deep-search page on the skipped-total path', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue({
        page: 3,
        perPage: 25,
        totalItems: -1,
        totalPages: 3,
        items: [makeRecord()],
      });

      const result = await service.getProjects({
        filters: { userId: 'user-123', searchTerm: 'sparkle', searchAllFields: true },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 3,
        pageSize: 25,
        includeStatusCounts: false,
      });

      expect(pbMock.collectionMethods.getList).toHaveBeenCalledTimes(1);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('getProjects(): sort string emission', () => {
    it('sorts by status_order (not status) with title_sort as tiebreaker', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'status', direction: 'asc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('+status_order,+title_sort');
    });

    it('pins NULL/empty dates last via has_value sentinel on ascending sort', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'date_purchased', direction: 'asc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('+date_purchased_has_value,+date_purchased,+title_sort');
    });

    it('pins NULL/empty dates last on descending sort, sentinel stays ASC', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'date_purchased', direction: 'desc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('+date_purchased_has_value,-date_purchased,-title_sort');
    });

    it('sorts companies by name (not ID) with empty companies last', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'company', direction: 'asc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('+company_sort_order,+company_name_sort,+title_sort');
    });

    it('sorts artists by name (not ID) with empty artists last', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'artist', direction: 'asc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('+artist_sort_order,+artist_name_sort,+title_sort');
    });

    it('uses title_sort (normalized) for kit_name sort, no double tiebreaker', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'kit_name', direction: 'asc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('+title_sort');
    });

    it('uses title_sort for kit_name desc too', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: { userId: 'user-123' },
        sort: { field: 'kit_name', direction: 'desc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.sort).toBe('-title_sort');
    });
  });

  describe('getProjects(): filter construction', () => {
    it('groups deep-search OR clauses so user and status filters still apply', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: {
          userId: 'user-123',
          status: 'progress',
          searchTerm: 'sparkle',
          searchAllFields: true,
        },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 1,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.filter).toContain('user = user-123 && status = progress');
      expect(opts.filter).toContain(
        '(title ~ %sparkle% || general_notes ~ %sparkle% || source_url ~ %sparkle%)'
      );
    });

    it('does not skip totals for later-page shallow searches', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([], 0));

      await service.getProjects({
        filters: {
          userId: 'user-123',
          searchTerm: 'sparkle',
        },
        sort: { field: 'last_updated', direction: 'desc' },
        page: 2,
        pageSize: 20,
        includeStatusCounts: false,
      });

      const opts = pbMock.collectionMethods.getList.mock.calls[0][2];
      expect(opts.skipTotal).toBe(false);
    });
  });

  // ── CRUD with ownership checks ────────────────────────────────────

  describe('update()', () => {
    it('verifies ownership before updating', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'user-123' });
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'proj-1' });

      await service.update('proj-1', { status: 'completed' });

      expect(pbMock.collectionMethods.getOne).toHaveBeenCalledWith('proj-1', {
        fields: 'id,user',
      });
      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('proj-1', {
        status: 'completed',
        status_order: 7,
      });
    });

    it('derives status_order from status on update', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'user-123' });
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'proj-1' });

      await service.update('proj-1', { status: 'wishlist', title: 'renamed' });

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('proj-1', {
        status: 'wishlist',
        title: 'renamed',
        status_order: 1,
      });
    });

    it('leaves partial updates without status untouched', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'user-123' });
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'proj-1' });

      await service.update('proj-1', { title: 'just a rename' });

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('proj-1', {
        title: 'just a rename',
      });
    });

    it('throws permission error when user does not own the project', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'other-user' });

      try {
        await service.update('proj-1', { status: 'completed' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toMatchObject({
          type: 'permission',
          message: expect.stringContaining('permission'),
        });
      }
    });
  });

  describe('updateWithCurrent()', () => {
    it('uses one owned read to build and save a partial update', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({
        id: 'proj-1',
        user: 'user-123',
        status: 'progress',
        date_started: '2025-02-01',
      });
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'proj-1', user: 'user-123' });
      const buildData = vi.fn(async current => ({
        date_completed: current.dateStarted,
        status: 'completed',
      }));

      await service.updateWithCurrent('proj-1', ['status', 'date_started'], buildData);

      expect(pbMock.collectionMethods.getOne).toHaveBeenCalledTimes(1);
      expect(pbMock.collectionMethods.getOne).toHaveBeenCalledWith('proj-1', {
        fields: 'id,user,status,date_started',
      });
      expect(buildData).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'progress', dateStarted: '2025-02-01' })
      );
      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('proj-1', {
        date_completed: '2025-02-01',
        status: 'completed',
        status_order: 7,
      });
    });

    it('does not build or write when the saved project has another owner', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'other-user' });
      const buildData = vi.fn(async () => ({ status: 'completed' }));

      await expect(
        service.updateWithCurrent('proj-1', ['status'], buildData)
      ).rejects.toMatchObject({
        type: 'permission',
      });

      expect(buildData).not.toHaveBeenCalled();
      expect(pbMock.collectionMethods.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteProject()', () => {
    it('verifies ownership before deleting', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'user-123' });

      await service.deleteProject('proj-1');

      expect(pbMock.collectionMethods.getOne).toHaveBeenCalledWith('proj-1', {
        fields: 'id,user',
      });
      expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('proj-1');
    });

    it('throws permission error when user does not own the project', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'proj-1', user: 'other-user' });

      try {
        await service.deleteProject('proj-1');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toMatchObject({
          type: 'permission',
          message: expect.stringContaining('permission'),
        });
      }
    });
  });

  // ── Other CRUD methods ────────────────────────────────────────────

  describe('getOne()', () => {
    it('returns a ProjectDTO transformed from the PocketBase record', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({
        id: 'proj-1',
        user: 'u1',
        title: 'My Kit',
        company: 'c1',
        artist: 'a1',
        status: 'wishlist',
        kit_category: 'full',
        drill_shape: 'round',
        date_purchased: '2024-01-01',
        date_received: '',
        date_started: '',
        date_completed: '',
        width: 40,
        height: 50,
        total_diamonds: 1000,
        general_notes: 'notes',
        image: 'kit.jpg',
        source_url: '',
        created: '2024-01-01',
        updated: '2024-01-02',
      });

      const result = await service.getOne('proj-1');

      expect(result).toEqual({
        id: 'proj-1',
        userId: 'u1',
        title: 'My Kit',
        companyId: 'c1',
        artistId: 'a1',
        status: 'wishlist',
        kitCategory: 'full',
        drillShape: 'round',
        datePurchased: '2024-01-01',
        dateReceived: '',
        dateStarted: '',
        dateCompleted: '',
        width: 40,
        height: 50,
        totalDiamonds: 1000,
        colorCount: undefined,
        generalNotes: 'notes',
        image: 'kit.jpg',
        sourceUrl: '',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        revision: 0,
      });
    });
  });

  describe('create()', () => {
    it('delegates to PocketBase create', async () => {
      pbMock.collectionMethods.create.mockResolvedValue({ id: 'new-1' });

      const result = await service.create({ title: 'New Kit', user: 'user-123' });

      expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
        title: 'New Kit',
        user: 'user-123',
      });
      expect(result.id).toBe('new-1');
    });
  });

  describe('getAvailableYears()', () => {
    it.each(['2026-01-01', '2026-01-01T00:00:00.000Z', '2026-01-01 00:00:00.000Z'])(
      'preserves the stored January 1 calendar year for %s',
      async dateCompleted => {
        pbMock.collectionMethods.getFullList.mockResolvedValue([{ date_completed: dateCompleted }]);

        expect(await service.getAvailableYears('user-123')).toEqual([2026]);
      }
    );

    it('extracts and sorts unique years from date_completed', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([
        { date_completed: '2023-06-15 12:00:00' },
        { date_completed: '2024-03-01 12:00:00' },
        { date_completed: '2023-12-25 12:00:00' },
        { date_completed: '2022-06-15 12:00:00' },
      ]);

      const years = await service.getAvailableYears('user-123');

      expect(years).toEqual([2024, 2023, 2022]);
    });

    it('skips records with invalid dates', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([
        { date_completed: '2023-06-15' },
        { date_completed: '' },
        { date_completed: 'not-a-date' },
        { date_completed: '2025-02-29' },
        { date_completed: '2026-13-01' },
      ]);

      const years = await service.getAvailableYears('user-123');

      expect(years).toEqual([2023]);
    });
  });
});
