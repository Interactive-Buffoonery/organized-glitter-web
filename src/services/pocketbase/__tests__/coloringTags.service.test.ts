import { SessionChangedError } from '@/services/auth/sessionRecovery';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getList: vi.fn(),
    getFullList: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn((expr: string) => expr),
      send: vi.fn(),
    },
    collectionMethods,
    createListResult: (items: unknown[] = []) => ({
      page: 1,
      perPage: Math.max(items.length, 1),
      totalItems: items.length,
      totalPages: items.length > 0 ? 1 : 0,
      items,
    }),
    reset: () => {
      Object.values(collectionMethods).forEach(method => method.mockReset());
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
  }),
}));

import { ColoringTagService } from '../coloringTags.service';

describe('ColoringTagService', () => {
  beforeEach(() => {
    pbMock.reset();
    pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([]));
  });

  it('loads every coloring tag page with owner and search filters and name sorting', async () => {
    const records = Array.from({ length: 201 }, (_, index) => ({
      id: `tag-${index}`,
      user: 'user-123',
      name: `Cozy ${String(index).padStart(3, '0')}`,
      slug: `cozy-${index}`,
      color: '#14b8a6',
      created: '2026-01-01',
      updated: '2026-01-01',
    }));
    pbMock.collectionMethods.getList.mockImplementation(async (page: number) => ({
      page,
      perPage: 200,
      totalItems: records.length,
      totalPages: 2,
      items: page === 1 ? records.slice(0, 200) : records.slice(200),
    }));

    const result = await ColoringTagService.listColoringTags({ search: '  Cozy  ' });

    expect(result.status).toBe('success');
    expect(result.data).toHaveLength(201);
    expect(result.data?.at(-1)).toMatchObject({ id: 'tag-200', name: 'Cozy 200' });
    for (const page of [1, 2]) {
      expect(pbMock.collectionMethods.getList).toHaveBeenCalledWith(page, 200, {
        filter: 'user = {:userId} && name ~ {:search}',
        sort: 'name',
      });
    }
    expect(pbMock.pb.filter).toHaveBeenCalledWith('user = {:userId}', { userId: 'user-123' });
    expect(pbMock.pb.filter).toHaveBeenCalledWith('name ~ {:search}', { search: 'Cozy' });
  });

  it('returns an error rather than a partial coloring tag list when a later page fails', async () => {
    const failure = new Error('Second page unavailable');
    pbMock.collectionMethods.getList
      .mockResolvedValueOnce({
        page: 1,
        perPage: 200,
        totalItems: 201,
        totalPages: 2,
        items: Array.from({ length: 200 }, (_, index) => ({ id: `tag-${index}`, name: 'Cozy' })),
      })
      .mockRejectedValueOnce(failure);

    const result = await ColoringTagService.listColoringTags();

    expect(result).toEqual({ status: 'error', data: null, error: failure });
  });

  it('propagates a late session change during tag synchronization', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'book-1', user: 'user-123' });
    pbMock.collectionMethods.getFullList.mockRejectedValue(new SessionChangedError());

    await expect(ColoringTagService.syncBookTags('book-1', [])).rejects.toMatchObject({
      reason: 'session_changed',
    });
  });

  it('updates coloring tags after verifying ownership', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'tag-1', user: 'user-123' });
    pbMock.collectionMethods.update.mockResolvedValue({
      id: 'tag-1',
      user: 'user-123',
      name: 'Detailed',
      slug: 'detailed',
      color: '#8b5cf6',
      created: '2026-01-01',
      updated: '2026-01-02',
    });

    const result = await ColoringTagService.updateColoringTag('tag-1', {
      name: 'Detailed',
      color: '#8b5cf6',
    });

    expect(result.status).toBe('success');
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('tag-1', {
      name: 'Detailed',
      slug: 'detailed',
      color: '#8b5cf6',
    });
  });
});
