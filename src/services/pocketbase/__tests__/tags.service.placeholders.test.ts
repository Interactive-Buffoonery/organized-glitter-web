import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getList: vi.fn(),
    create: vi.fn(),
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

import { TagService } from '../tags.service';

describe('TagService placeholder-like names', () => {
  beforeEach(() => {
    pbMock.reset();
    pbMock.collectionMethods.getList.mockResolvedValue(pbMock.createListResult([]));
  });

  it('allows Other as an intentional tag name', async () => {
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'tag-other',
      user: 'user-123',
      name: 'Other',
      slug: 'other',
      color: '#8b5cf6',
      created: '2026-01-01',
      updated: '2026-01-01',
    });

    const result = await TagService.createTag({ name: 'Other', color: '#8b5cf6' });

    expect(result.status).toBe('success');
    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      user: 'user-123',
      name: 'Other',
      slug: 'other',
      color: '#8b5cf6',
    });
  });

  it('loads requested tag counts with one aggregate request', async () => {
    pbMock.pb.send.mockResolvedValue({ counts: { 'tag-used': 3, 'tag-extra': 8 } });

    const result = await TagService.getBulkTagStats(['tag-used', 'tag-unused']);

    expect(result).toEqual({
      status: 'success',
      data: { 'tag-used': 3, 'tag-unused': 0 },
      error: null,
    });
    expect(pbMock.pb.send).toHaveBeenCalledOnce();
    expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/tag-project-counts', {
      method: 'GET',
    });
  });
});
