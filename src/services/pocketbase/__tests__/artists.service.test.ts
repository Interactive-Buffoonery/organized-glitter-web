/**
 * Tests for ArtistsService
 * Covers: explicit userId, ServiceError normalization, narrowed list types,
 * duplicate-name validation and ownership checks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionState = vi.hoisted(() => ({ accountId: 'user-123', generation: 0 }));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ ...sessionState }),
  isCurrentSessionIdentity: (identity: { accountId: string; generation: number }) =>
    identity.accountId === sessionState.accountId &&
    identity.generation === sessionState.generation,
}));

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
      send: vi.fn(),
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
    sessionState.accountId = 'user-123';
    sessionState.generation = 0;
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
    it('does not write after logout and relogin during duplicate lookup', async () => {
      let finishLookup!: (reason: unknown) => void;
      pbMock.collectionMethods.getFirstListItem.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            finishLookup = reject;
          })
      );
      const pending = ArtistsService.create({ name: 'New metadata' });
      sessionState.generation += 2;
      finishLookup({ type: 'not_found', message: 'Not found', retryable: false });
      await expect(pending).rejects.toMatchObject({ reason: 'session_changed' });
      expect(pbMock.collectionMethods.create).not.toHaveBeenCalled();
    });

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
    it('does not delete after logout and relogin during ownership lookup', async () => {
      let finishLookup!: (value: { id: string; user: string }) => void;
      pbMock.collectionMethods.getOne.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishLookup = resolve;
          })
      );
      const pending = ArtistsService.delete('metadata-1');
      sessionState.generation += 2;
      finishLookup({ id: 'metadata-1', user: 'user-123' });
      await expect(pending).rejects.toMatchObject({ reason: 'session_changed' });
      expect(pbMock.collectionMethods.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned record while the originating session is current', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValueOnce({ id: 'metadata-1', user: 'user-123' });
      await ArtistsService.delete('metadata-1');
      expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('metadata-1');
    });

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

  describe('getProjectCounts()', () => {
    it('loads all artist counts with one aggregate request', async () => {
      pbMock.pb.send.mockResolvedValue({ counts: { a1: 3, a2: 1 } });

      const counts = await ArtistsService.getProjectCounts();

      expect(pbMock.pb.send).toHaveBeenCalledOnce();
      expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/artist-project-counts', {
        method: 'GET',
      });
      expect(counts).toEqual({ a1: 3, a2: 1 });
    });
  });
});
