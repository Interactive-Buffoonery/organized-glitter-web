import { act, beforeEach, describe, expect, it, renderHookWithProviders } from '@/test-utils';
import { vi } from 'vitest';
import type { Tag } from '@/types/tag';

const {
  mockCreateTag,
  mockUpdateTag,
  mockDeleteTag,
  mockUseAuth,
  mockNotify,
  mockLoggerError,
  mockCapture,
} = vi.hoisted(() => ({
  mockCreateTag: vi.fn(),
  mockUpdateTag: vi.fn(),
  mockDeleteTag: vi.fn(),
  mockUseAuth: vi.fn(),
  mockNotify: vi.fn(),
  mockLoggerError: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.doMock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    createTag: mockCreateTag,
    updateTag: mockUpdateTag,
    deleteTag: mockDeleteTag,
  },
}));

vi.doMock('@/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.doMock('@/lib/notifications', () => ({
  notify: mockNotify,
}));

vi.doMock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: mockLoggerError,
    warn: vi.fn(),
    log: vi.fn(),
    criticalError: vi.fn(),
  }),
  logger: {
    error: mockLoggerError,
  },
}));

vi.doMock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
}));

const [{ useCreateTag }, { useUpdateTag }, { useDeleteTag }] = await Promise.all([
  import('../useCreateTag'),
  import('../useUpdateTag'),
  import('../useDeleteTag'),
]);

const tag: Tag = {
  id: 'tag-1',
  userId: 'user-1',
  name: 'Favorites',
  slug: 'favorites',
  color: '#7c3aed',
  createdAt: '2026-04-25T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
};

describe('tag mutation auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockCreateTag.mockResolvedValue({ status: 'success', data: tag, error: null });
    mockUpdateTag.mockResolvedValue({ status: 'success', data: tag, error: null });
    mockDeleteTag.mockResolvedValue({ status: 'success', data: undefined, error: null });
  });

  it('does not call TagService.createTag when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHookWithProviders(() => useCreateTag());

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Favorites' })).rejects.toThrow(
        'User not authenticated'
      );
    });

    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it('calls TagService.createTag when authenticated', async () => {
    const { result } = renderHookWithProviders(() => useCreateTag());

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Favorites' })).resolves.toEqual(tag);
    });

    expect(mockCreateTag).toHaveBeenCalledWith({ name: 'Favorites' });
  });

  it('does not call TagService.updateTag when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHookWithProviders(() => useUpdateTag());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 'tag-1', updates: { name: 'Favorites' } })
      ).rejects.toThrow('User not authenticated');
    });

    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it('calls TagService.updateTag when authenticated', async () => {
    const { result } = renderHookWithProviders(() => useUpdateTag());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 'tag-1', updates: { name: 'Favorites' } })
      ).resolves.toEqual(tag);
    });

    expect(mockUpdateTag).toHaveBeenCalledWith('tag-1', { name: 'Favorites' });
  });

  it('does not call TagService.deleteTag when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHookWithProviders(() => useDeleteTag());

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'tag-1' })).rejects.toThrow(
        'User not authenticated'
      );
    });

    expect(mockDeleteTag).not.toHaveBeenCalled();
  });

  it('calls TagService.deleteTag when authenticated', async () => {
    const { result } = renderHookWithProviders(() => useDeleteTag());

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'tag-1' })).resolves.toBeUndefined();
    });

    expect(mockDeleteTag).toHaveBeenCalledWith('tag-1');
  });
});
