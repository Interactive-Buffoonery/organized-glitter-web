import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn((expr: string) => expr),
    },
    collectionMethods,
    reset: () => {
      Object.values(collectionMethods).forEach(method => method.mockReset());
      pbMock.pb.collection.mockClear();
      pbMock.pb.filter.mockClear();
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({ pb: pbMock.pb }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { DashboardSettingsService, normalizeRandomizerNextUp } from '../dashboardSettings.service';
import type { RandomizerNextUpPreferences } from '@/types/randomizer';

const notFoundError = {
  type: 'not_found',
  message: 'Missing settings row',
  retryable: false,
};

const nextUpPreferences: RandomizerNextUpPreferences = {
  version: 1,
  targets: {
    diamond: {
      id: 'project12345678',
      mode: 'diamond',
      targetType: 'diamond_project',
      title: 'Aurora Wolves',
      subtitle: 'Moonlight Co.',
      href: '/projects/project12345678',
      savedAt: '2026-05-10T12:00:00.000Z',
    },
  },
};

describe('DashboardSettingsService randomizer next-up preferences', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  it('returns defaults when the settings row is missing', async () => {
    pbMock.collectionMethods.getFirstListItem.mockRejectedValue(notFoundError);

    await expect(DashboardSettingsService.getRandomizerNextUp('user12345678901')).resolves.toEqual({
      version: 1,
      targets: {},
    });
  });

  it('loads an existing settings row', async () => {
    pbMock.collectionMethods.getFirstListItem.mockResolvedValue({
      id: 'settings123456',
      randomizer_next_up: nextUpPreferences,
    });

    await expect(DashboardSettingsService.getRandomizerNextUp('user12345678901')).resolves.toEqual(
      nextUpPreferences
    );
  });

  it('falls back to defaults for malformed JSON', () => {
    expect(normalizeRandomizerNextUp({ version: 2, targets: [] })).toEqual({
      version: 1,
      targets: {},
    });
    expect(
      normalizeRandomizerNextUp({
        version: 1,
        targets: {
          diamond: {
            id: 'project12345678',
            mode: 'diamond',
            targetType: 'unknown',
            title: 'Aurora Wolves',
          },
        },
      })
    ).toEqual({
      version: 1,
      targets: {},
    });
  });

  it('updates by cached settings id when available', async () => {
    pbMock.collectionMethods.update.mockResolvedValue({ id: 'settings123456' });

    await expect(
      DashboardSettingsService.saveRandomizerNextUp(
        'user12345678901',
        nextUpPreferences,
        'settings123456'
      )
    ).resolves.toBe('settings123456');

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('settings123456', {
      randomizer_next_up: nextUpPreferences,
    });
    expect(pbMock.collectionMethods.getFirstListItem).not.toHaveBeenCalled();
  });

  it('falls back to lookup when the cached settings id is stale', async () => {
    pbMock.collectionMethods.update.mockRejectedValueOnce(notFoundError).mockResolvedValueOnce({
      id: 'settings-existing',
    });
    pbMock.collectionMethods.getFirstListItem.mockResolvedValue({ id: 'settings-existing' });

    await expect(
      DashboardSettingsService.saveRandomizerNextUp(
        'user12345678901',
        nextUpPreferences,
        'stale-settings'
      )
    ).resolves.toBe('settings-existing');

    expect(pbMock.collectionMethods.update).toHaveBeenNthCalledWith(1, 'stale-settings', {
      randomizer_next_up: nextUpPreferences,
    });
    expect(pbMock.collectionMethods.update).toHaveBeenNthCalledWith(2, 'settings-existing', {
      randomizer_next_up: nextUpPreferences,
    });
  });

  it('creates a settings row when no row exists during save', async () => {
    pbMock.collectionMethods.getFirstListItem.mockRejectedValue(notFoundError);
    pbMock.collectionMethods.create.mockResolvedValue({ id: 'settings-created' });

    await expect(
      DashboardSettingsService.saveRandomizerNextUp('user12345678901', nextUpPreferences)
    ).resolves.toBe('settings-created');

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      user: 'user12345678901',
      randomizer_next_up: nextUpPreferences,
    });
  });

  it('recovers when another request creates the settings row first', async () => {
    pbMock.collectionMethods.getFirstListItem
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce({ id: 'settings-concurrent' });
    pbMock.collectionMethods.create.mockRejectedValue({
      type: 'validation',
      message: 'Value must be unique',
      retryable: false,
    });
    pbMock.collectionMethods.update.mockResolvedValue({ id: 'settings-concurrent' });

    await expect(
      DashboardSettingsService.saveRandomizerNextUp('user12345678901', nextUpPreferences)
    ).resolves.toBe('settings-concurrent');

    expect(pbMock.collectionMethods.getFirstListItem).toHaveBeenCalledTimes(2);
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('settings-concurrent', {
      randomizer_next_up: nextUpPreferences,
    });
  });
});
