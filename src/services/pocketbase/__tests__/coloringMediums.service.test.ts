import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getFirstListItem: vi.fn(),
    getList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getOne: vi.fn(),
    delete: vi.fn(),
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

import { ColoringMediumsService } from '../coloringMediums.service';

describe('ColoringMediumsService', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  it('allows Other as an intentional medium name and other as a medium type', async () => {
    pbMock.collectionMethods.getFirstListItem.mockRejectedValue({
      type: 'not_found',
      message: 'not found',
      retryable: false,
    });
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'medium-1',
      user: 'user-123',
      name: 'Other',
      type: 'other',
      brand: '',
      color_count: 0,
      notes: '',
      created: '2026-01-01',
      updated: '2026-01-01',
    });

    const result = await ColoringMediumsService.createColoringMedium({
      name: 'Other',
      type: 'other',
      brand: '',
      colorCount: '',
      notes: '',
    });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      name: 'Other',
      type: 'other',
      brand: '',
      color_count: 0,
      notes: '',
      user: 'user-123',
    });
    expect(result).toMatchObject({
      id: 'medium-1',
      name: 'Other',
      type: 'other',
      brand: '',
      colorCount: 0,
      notes: '',
    });
  });

  it('allows acrylic paint pen as a medium type', async () => {
    pbMock.collectionMethods.getFirstListItem.mockRejectedValue({
      type: 'not_found',
      message: 'not found',
      retryable: false,
    });
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'medium-1',
      user: 'user-123',
      name: 'Posca',
      type: 'acrylic_paint_pen',
      brand: 'Uni',
      color_count: 24,
      notes: '',
      created: '2026-01-01',
      updated: '2026-01-01',
    });

    const result = await ColoringMediumsService.createColoringMedium({
      name: 'Posca',
      type: 'acrylic_paint_pen',
      brand: 'Uni',
      colorCount: '24',
      notes: '',
    });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith({
      name: 'Posca',
      type: 'acrylic_paint_pen',
      brand: 'Uni',
      color_count: 24,
      notes: '',
      user: 'user-123',
    });
    expect(result).toMatchObject({
      id: 'medium-1',
      name: 'Posca',
      type: 'acrylic_paint_pen',
      brand: 'Uni',
      colorCount: 24,
    });
  });
});
