/**
 * Tests for UsersService
 * Covers: profile queries, avatar mutations, username availability
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getOne: vi.fn(),
    getList: vi.fn(),
    getFullList: vi.fn(),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    authRefresh: vi.fn(),
    subscribe: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      realtime: { subscribe: vi.fn() },
      filter: vi.fn((expr: string) => expr),
    },
    collectionMethods,
    reset: () => {
      pbMock.pb.realtime.subscribe.mockReset();
      Object.values(collectionMethods).forEach(m => m.mockReset());
      collectionMethods.delete.mockResolvedValue(true);
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({ pb: pbMock.pb }));
vi.mock('@/services/auth', () => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'u1'),
}));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { UsersService } from '../users.service';

describe('UsersService', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  describe('analytics preference', () => {
    it('fails closed when the backend does not return the preference field', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'u1' });

      await expect(UsersService.getAnalyticsOptOut('u1')).rejects.toMatchObject({
        type: 'server',
      });
    });

    it('subscribes to this account and returns the scoped unsubscribe function', async () => {
      const unsubscribe = vi.fn().mockResolvedValue(undefined);
      const callback = vi.fn();
      pbMock.collectionMethods.subscribe.mockResolvedValue(unsubscribe);

      const returnedUnsubscribe = await UsersService.subscribeAnalyticsPreference('u1', callback);
      const subscriptionCallback = pbMock.collectionMethods.subscribe.mock.calls[0][1];
      subscriptionCallback({ action: 'update', record: { analytics_opt_out: true } });

      expect(pbMock.collectionMethods.subscribe).toHaveBeenCalledWith('u1', subscriptionCallback, {
        fields: 'analytics_opt_out',
      });
      expect(callback).toHaveBeenCalledWith(true);
      expect(returnedUnsubscribe).toBe(unsubscribe);
    });

    it('fails closed when a realtime event omits the preference field', async () => {
      const callback = vi.fn();
      pbMock.collectionMethods.subscribe.mockResolvedValue(vi.fn());

      await UsersService.subscribeAnalyticsPreference('u1', callback);
      const subscriptionCallback = pbMock.collectionMethods.subscribe.mock.calls[0][1];
      subscriptionCallback({ action: 'update', record: {} });

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('fails closed when the account is deleted', async () => {
      const callback = vi.fn();
      pbMock.collectionMethods.subscribe.mockResolvedValue(vi.fn());

      await UsersService.subscribeAnalyticsPreference('u1', callback);
      const subscriptionCallback = pbMock.collectionMethods.subscribe.mock.calls[0][1];
      subscriptionCallback({ action: 'delete', record: { analytics_opt_out: false } });

      expect(callback).toHaveBeenCalledWith(true);
    });
  });
});
