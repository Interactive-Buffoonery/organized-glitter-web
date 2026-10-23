/**
 * Tests for ProjectsService
 * Covers: filter construction, search modes, status counts, pagination,
 * record transformation, ownership checks, CRUD operations
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsService } from '../projects.service';

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

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(() => {
    pbMock.reset();
    service = new ProjectsService({ enablePerformanceLogging: false });
  });

  // ── Status counts ─────────────────────────────────────────────────

  describe('getBatchStatusCounts()', () => {
    it('filters by userId', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([]);

      await service.getBatchStatusCounts({ userId: 'user-456' });

      const callArgs = pbMock.collectionMethods.getFullList.mock.calls[0][0];
      expect(callArgs.filter).toContain('user-456');
    });
  });

  // ── Record transformation ─────────────────────────────────────────

  describe('getProjects(): record transformation', () => {
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
  });

  // ── CRUD with ownership checks ────────────────────────────────────

  describe('update()', () => {
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
});
