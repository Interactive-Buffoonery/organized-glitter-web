/**
 * Tests for ArtistsService
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

import { ArtistsService } from '../artists.service';
import { ErrorHandler } from '../base/ErrorHandler';

describe('ArtistsService', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  describe('list()', () => {
    it('accepts explicit userId and passes it to the filter', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([{ id: 'a1', name: 'Monet' }])
      );

      const result = await ArtistsService.list('user-456');

      expect(pbMock.pb.filter).toHaveBeenCalledWith('user = {:userId}', { userId: 'user-456' });
      expect(result.items).toEqual([{ id: 'a1', name: 'Monet' }]);
    });

    it('returns narrowed ArtistListItem shape', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([{ id: 'a1', name: 'Monet' }])
      );

      const result = await ArtistsService.list('user-123');
      expect(result.items[0]).toHaveProperty('id');
      expect(result.items[0]).toHaveProperty('name');
    });

    it('throws ServiceError when userId is empty', async () => {
      await expect(ArtistsService.list('')).rejects.toMatchObject({
        type: 'auth',
        message: 'User ID is required',
      });
    });
  });

  describe('create()', () => {
    it('throws validation ServiceError on duplicate name', async () => {
      pbMock.collectionMethods.getFirstListItem.mockResolvedValue({
        id: 'existing',
        name: 'Monet',
      });

      try {
        await ArtistsService.create({ name: 'Monet' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('validation');
          expect(error.message).toContain('Monet');
        }
      }
    });

    it('allows placeholder-like names when the user creates them intentionally', async () => {
      pbMock.collectionMethods.getFirstListItem.mockRejectedValue({
        type: 'not_found',
        message: 'not found',
        retryable: false,
      });
      pbMock.collectionMethods.create.mockResolvedValue({
        id: 'unknown-artist',
        name: 'Unknown',
        user: 'user-123',
      });

      const result = await ArtistsService.create({ name: 'Unknown' });

      expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
        name: 'Unknown',
        user: 'user-123',
      });
      expect(result.name).toBe('Unknown');
    });
  });

  describe('update()', () => {
    it('throws permission ServiceError when user does not own the record', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'a1', user: 'other-user' });

      try {
        await ArtistsService.update('a1', { name: 'New' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('permission');
        }
      }
    });

    it('throws validation ServiceError on duplicate name during update', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'a1', user: 'user-123' });
      pbMock.collectionMethods.getList.mockResolvedValue(
        pbMock.createListResult([{ id: 'a2', name: 'Existing' }])
      );

      try {
        await ArtistsService.update('a1', { name: 'Existing' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('validation');
        }
      }
    });
  });

  describe('delete()', () => {
    it('throws permission ServiceError when user does not own the record', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'a1', user: 'other-user' });

      try {
        await ArtistsService.delete('a1');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('permission');
        }
      }
    });
  });
});
