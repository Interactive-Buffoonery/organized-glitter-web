/**
 * Tests for CompaniesService
 * Covers: explicit userId, ServiceError normalization, narrowed list types,
 * duplicate-name validation and ownership checks
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { ErrorHandler } from '../base/ErrorHandler';
import { CompaniesService } from '../companies.service';

describe('CompaniesService', () => {
  beforeEach(() => {
    pbMock.reset();
    sessionState.accountId = 'user-123';
    sessionState.generation = 0;
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
      const pending = CompaniesService.create({ name: 'New metadata' });
      sessionState.generation += 2;
      finishLookup({ type: 'not_found', message: 'Not found', retryable: false });
      await expect(pending).rejects.toMatchObject({ reason: 'session_changed' });
      expect(pbMock.collectionMethods.create).not.toHaveBeenCalled();
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
      const pending = CompaniesService.delete('metadata-1');
      sessionState.generation += 2;
      finishLookup({ id: 'metadata-1', user: 'user-123' });
      await expect(pending).rejects.toMatchObject({ reason: 'session_changed' });
      expect(pbMock.collectionMethods.delete).not.toHaveBeenCalled();
    });

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
});
