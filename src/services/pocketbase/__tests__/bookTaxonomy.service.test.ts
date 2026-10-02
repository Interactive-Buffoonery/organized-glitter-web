import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getFirstListItem: vi.fn(),
    create: vi.fn(),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn((expr: string) => expr),
    },
    collectionMethods,
    reset: () => {
      Object.values(collectionMethods).forEach(method => method.mockReset());
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({ pb: pbMock.pb }));
vi.mock('@/services/auth', () => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'user-123'),
}));

import { BookIllustratorsService } from '../bookIllustrators.service';
import { BookPublishersService } from '../bookPublishers.service';

describe('book taxonomy services', () => {
  beforeEach(() => {
    pbMock.reset();
    pbMock.collectionMethods.getFirstListItem.mockRejectedValue({
      type: 'not_found',
      message: 'not found',
      retryable: false,
    });
  });

  it('allows Other as an intentional publisher name', async () => {
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'publisher-other',
      user: 'user-123',
      name: 'Other',
      website_url: '',
      created: '2026-01-01',
      updated: '2026-01-01',
    });

    const result = await BookPublishersService.create({ name: 'Other' });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      name: 'Other',
      website_url: '',
      user: 'user-123',
    });
    expect(result.name).toBe('Other');
  });

  it('allows Unknown as an intentional illustrator name', async () => {
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'illustrator-unknown',
      user: 'user-123',
      name: 'Unknown',
      created: '2026-01-01',
      updated: '2026-01-01',
    });

    const result = await BookIllustratorsService.create({ name: 'Unknown' });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      name: 'Unknown',
      user: 'user-123',
    });
    expect(result.name).toBe('Unknown');
  });
});
