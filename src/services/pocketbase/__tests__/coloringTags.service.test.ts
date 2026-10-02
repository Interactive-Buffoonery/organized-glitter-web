import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionChangedError } from '@/services/auth/sessionRecovery';

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

  it('creates coloring tags in the coloring_tags collection', async () => {
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'coloring-tag-1',
      user: 'user-123',
      name: 'Cozy',
      slug: 'cozy',
      color: '#14b8a6',
      created: '2026-01-01',
      updated: '2026-01-01',
    });

    const result = await ColoringTagService.createColoringTag({
      name: 'Cozy',
      color: '#14b8a6',
    });

    expect(result.status).toBe('success');
    expect(pbMock.pb.collection).toHaveBeenCalledWith('coloring_tags');
    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      user: 'user-123',
      name: 'Cozy',
      slug: 'cozy',
      color: '#14b8a6',
    });
  });

  it('syncs coloring book tag joins with coloring tag ids', async () => {
    pbMock.collectionMethods.getOne
      .mockResolvedValueOnce({ id: 'book-1', user: 'user-123' })
      .mockResolvedValueOnce({ id: 'tag-new', user: 'user-123' });
    pbMock.collectionMethods.getFullList.mockResolvedValue([
      { id: 'join-old', book: 'book-1', tag: 'tag-old' },
    ]);

    const result = await ColoringTagService.syncBookTags('book-1', ['tag-new']);

    expect(result.status).toBe('success');
    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      book: 'book-1',
      tag: 'tag-new',
    });
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('join-old');
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

  it('lets PocketBase reject a coloring tag that is still referenced', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({ id: 'tag-1', user: 'user-123' });

    const result = await ColoringTagService.deleteColoringTag('tag-1');

    expect(result.status).toBe('success');
    expect(pbMock.collectionMethods.getFullList).not.toHaveBeenCalled();
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('tag-1');
  });

  it('loads requested coloring tag counts with one aggregate request', async () => {
    pbMock.pb.send.mockResolvedValue({ counts: { 'tag-used': 2, 'tag-extra': 5 } });

    const result = await ColoringTagService.getBulkColoringTagStats(['tag-used', 'tag-unused']);

    expect(result).toEqual({
      status: 'success',
      data: { 'tag-used': 2, 'tag-unused': 0 },
      error: null,
    });
    expect(pbMock.pb.send).toHaveBeenCalledOnce();
    expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/coloring-tag-book-counts', {
      method: 'GET',
    });
  });
});
