/**
 * Tests for UsersService
 * Covers: profile queries, avatar mutations, username availability
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getOne: vi.fn(),
    getList: vi.fn(),
    getFullList: vi.fn(),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    authRefresh: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn((expr: string) => expr),
    },
    collectionMethods,
    reset: () => {
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

  describe('getProfile()', () => {
    it('fetches user by explicit ID', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        username: 'testuser',
        theme_preference: 'catppuccin-frappe',
      });

      const profile = await UsersService.getProfile('u1');

      expect(pbMock.collectionMethods.getOne).toHaveBeenCalledWith('u1');
      expect(profile.id).toBe('u1');
      expect(profile.themePreference).toBe('dark');
    });

    it('defaults invalid or missing theme preference to system', async () => {
      pbMock.collectionMethods.getOne.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        username: 'testuser',
        theme_preference: 'catppuccin',
      });

      const profile = await UsersService.getProfile('u1');

      expect(profile.themePreference).toBe('system');
    });
  });

  describe('update()', () => {
    it('updates timezone', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({
        id: 'u1',
        timezone: 'America/New_York',
      });

      await UsersService.update('u1', { timezone: 'America/New_York' });

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('u1', {
        timezone: 'America/New_York',
      });
    });

    it('updates beta_tester flag', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({
        id: 'u1',
        beta_tester: true,
      });

      await UsersService.update('u1', { beta_tester: true });

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('u1', { beta_tester: true });
    });

    it('updates theme_preference', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({
        id: 'u1',
        theme_preference: 'dark',
      });

      await UsersService.update('u1', { theme_preference: 'dark' });

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('u1', {
        theme_preference: 'dark',
      });
    });
  });

  describe('markColoringWalkthroughSeen()', () => {
    it('sets the walkthrough flag and refreshes auth', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'u1' });
      pbMock.collectionMethods.authRefresh.mockResolvedValue({ id: 'u1' });

      await UsersService.markColoringWalkthroughSeen('u1');

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('u1', {
        coloring_walkthrough_seen: true,
      });
      expect(pbMock.collectionMethods.authRefresh).toHaveBeenCalledTimes(1);
    });

    it('still resolves when the auth refresh fails', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'u1' });
      pbMock.collectionMethods.authRefresh.mockRejectedValue(new Error('network'));

      await expect(UsersService.markColoringWalkthroughSeen('u1')).resolves.toBeUndefined();
    });
  });

  describe('uploadAvatar()', () => {
    it('sends file as FormData', async () => {
      const mockFile = new File(['img'], 'avatar.png', { type: 'image/png' });
      pbMock.collectionMethods.update.mockResolvedValue({
        id: 'u1',
        avatar: 'avatar.png',
      });

      await UsersService.uploadAvatar('u1', mockFile);

      const callArg = pbMock.collectionMethods.update.mock.calls[0][1];
      expect(callArg).toBeInstanceOf(FormData);
      expect(callArg.get('avatar')).toBe(mockFile);
    });
  });

  describe('removeAvatar()', () => {
    it('sets avatar to null', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({ id: 'u1', avatar: '' });

      await UsersService.removeAvatar('u1');

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('u1', { avatar: null });
    });
  });

  describe('isUsernameAvailable()', () => {
    it('returns true when no duplicate found', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue({ items: [], totalItems: 0 });

      const available = await UsersService.isUsernameAvailable('newname', 'u1');

      expect(available).toBe(true);
    });

    it('returns false when duplicate exists', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue({
        items: [{ id: 'u2', username: 'taken' }],
        totalItems: 1,
      });

      const available = await UsersService.isUsernameAvailable('taken', 'u1');

      expect(available).toBe(false);
    });
  });
});
