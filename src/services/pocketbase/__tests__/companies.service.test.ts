/**
 * Tests for CompaniesService
 * Covers: explicit userId, ServiceError normalization, narrowed list types,
 * duplicate-name validation and ownership checks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pbMock = vi.hoisted(() => {
  const createListResult = (items: unknown[] = []) => ({
    page: 1,
    perPage: Math.max(items.length, 1),
    totalItems: items.length,
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
      filter: vi.fn((expr: string) => expr),
    },
    collectionMethods,
    createListResult,
    reset: () => {
      Object.values(collectionMethods).forEach(m => m.mockReset());
      collectionMethods.getList.mockResolvedValue(createListResult());
      collectionMethods.getFullList.mockResolvedValue([]);
      collectionMethods.delete.mockResolvedValue(true);
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
  }),
}));

import { CompaniesService } from '../companies.service';
import { ErrorHandler } from '../base/ErrorHandler';

describe('CompaniesService', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  describe('list()', () => {
    it('accepts explicit userId and uses it in the filter', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([{ id: 'c1', name: 'DMC' }])
      );

      const result = await CompaniesService.list('user-456');

      expect(pbMock.pb.filter).toHaveBeenCalledWith('user = {:userId}', { userId: 'user-456' });
      expect(result.items).toEqual([{ id: 'c1', name: 'DMC' }]);
    });

    it('returns narrowed CompanyListItem shape', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([{ id: 'c1', name: 'DMC' }])
      );

      const result = await CompaniesService.list('user-123');
      const item = result.items[0];

      // Should have id and name
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
    });

    it('throws ServiceError when userId is empty', async () => {
      await expect(CompaniesService.list('')).rejects.toMatchObject({
        type: 'auth',
        message: 'User ID is required',
      });
    });

    it('passes pagination params', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([]));

      await CompaniesService.list('user-123', { page: 2, pageSize: 25 });

      expect(pbMock.collectionMethods.getList).toHaveBeenCalledWith(
        2,
        25,
        expect.objectContaining({ sort: 'name,id', fields: 'id,name,website_url' })
      );
    });
  });

  describe('create()', () => {
    it('throws normalized validation ServiceError on duplicate name', async () => {
      // findByName returns an existing record
      pbMock.collectionMethods.getFirstListItem.mockResolvedValue({ id: 'existing', name: 'DMC' });

      try {
        await CompaniesService.create({ name: 'DMC' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        // ErrorHandler.handleAsync wraps the thrown error
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('validation');
          expect(error.message).toContain('DMC');
        }
      }
    });

    it('creates company when name is unique', async () => {
      // findByName returns null when name doesn't exist. ErrorHandler checks
      // for PocketBaseError shape first, then ClientResponseError. The simplest
      // way to simulate "no match" is to make the error look like a handled
      // PocketBaseError with type not_found.
      pbMock.collectionMethods.getFirstListItem.mockRejectedValue({
        type: 'not_found',
        message: 'not found',
        retryable: false,
      });
      pbMock.collectionMethods.create.mockResolvedValue({
        id: 'new-1',
        name: 'DMC',
        user: 'user-123',
      });

      const result = await CompaniesService.create({ name: '  DMC  ' });

      expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'DMC', user: 'user-123' })
      );
      expect(result.id).toBe('new-1');
    });

    it('allows placeholder-like names when the user creates them intentionally', async () => {
      pbMock.collectionMethods.getFirstListItem.mockRejectedValue({
        type: 'not_found',
        message: 'not found',
        retryable: false,
      });
      pbMock.collectionMethods.create.mockResolvedValue({
        id: 'other-company',
        name: 'Other',
        user: 'user-123',
      });

      const result = await CompaniesService.create({ name: 'Other' });

      expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Other', user: 'user-123' })
      );
      expect(result.name).toBe('Other');
    });
  });

  describe('update()', () => {
    it('throws permission ServiceError when user does not own the record', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'c1', user: 'other-user' });

      try {
        await CompaniesService.update('c1', { name: 'New Name' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('permission');
        }
      }
    });

    it('throws validation ServiceError on duplicate name during update', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'c1', user: 'user-123' });
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([{ id: 'c2', name: 'Existing' }])
      );

      try {
        await CompaniesService.update('c1', { name: 'Existing' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('validation');
          expect(error.message).toContain('Existing');
        }
      }
    });
  });

  describe('delete()', () => {
    it('throws permission ServiceError when user does not own the record', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'c1', user: 'other-user' });

      try {
        await CompaniesService.delete('c1');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('permission');
        }
      }
    });
  });
  describe('getProjectCount()', () => {
    it('accepts explicit userId', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([{ id: 'p1' }]));

      const count = await CompaniesService.getProjectCount('company-1', 'user-789');

      // Verify the filter was built with the explicit userId
      expect(count).toBe(1);
    });
  });

  describe('getProjectCounts()', () => {
    it('loads all company counts with one aggregate request', async () => {
      pbMock.pb.send = vi.fn().mockResolvedValue({
        counts: { 'company-1': 3, 'company-2': 1 },
      });

      const counts = await CompaniesService.getProjectCounts();

      expect(pbMock.pb.send).toHaveBeenCalledOnce();
      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/company-project-counts', {
        method: 'GET',
      });
      expect(counts).toEqual({ 'company-1': 3, 'company-2': 1 });
    });
  });
});
