import { act, beforeEach, describe, expect, it, renderHookWithProviders } from '@/test-utils';
import { vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Tag } from '@/types/tag';

const {
  mockCreateTag,
  mockUpdateTag,
  mockDeleteTag,
  mockUseAuth,
  mockNotify,
  mockLoggerError,
  mockCapture,
  mockGetCurrentUserId,
} = vi.hoisted(() => ({
  mockCreateTag: vi.fn(),
  mockUpdateTag: vi.fn(),
  mockDeleteTag: vi.fn(),
  mockUseAuth: vi.fn(),
  mockNotify: vi.fn(),
  mockLoggerError: vi.fn(),
  mockCapture: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
}));

vi.doMock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    createTag: mockCreateTag,
    updateTag: mockUpdateTag,
    deleteTag: mockDeleteTag,
  },
}));

vi.doMock('@/services/auth', async () => ({
  ...(await vi.importActual<typeof import('@/services/auth')>('@/services/auth')),
  getCurrentUserId: mockGetCurrentUserId,
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
    mockGetCurrentUserId.mockReturnValue('user-1');
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
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('calls TagService.createTag when authenticated', async () => {
    const { result } = renderHookWithProviders(() => useCreateTag());

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Favorites' })).resolves.toEqual(tag);
    });

    expect(mockCreateTag).toHaveBeenCalledWith({ name: 'Favorites' });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith('tag_created', { craft: 'diamond' });
  });

  it('preserves successful completion when telemetry throws', async () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error('Telemetry unavailable');
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = vi.fn();
    const { result } = renderHookWithProviders(() => useCreateTag(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ name: 'Favorites' }, { onSuccess })
      ).resolves.toEqual(tag);
    });

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'success', title: 'Tag created' })
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });

  it.each(['user-2', null])(
    'does not attribute an in-flight creation to account %s',
    async currentUserId => {
      let finish!: (response: { status: string; data: Tag; error: null }) => void;
      mockCreateTag.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      const { result } = renderHookWithProviders(() => useCreateTag());

      await act(async () => {
        const creation = result.current.mutateAsync({ name: 'Favorites' });
        await vi.waitFor(() => expect(mockCreateTag).toHaveBeenCalled());
        mockGetCurrentUserId.mockReturnValue(currentUserId);
        finish({ status: 'success', data: tag, error: null });
        await expect(creation).resolves.toEqual(tag);
      });

      expect(mockCapture).not.toHaveBeenCalled();
    }
  );

  it('does not capture a failed tag creation or its input', async () => {
    mockCreateTag.mockResolvedValue({
      status: 'error',
      data: null,
      error: { message: 'Private failed-input content' },
    });
    const { result } = renderHookWithProviders(() => useCreateTag());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ name: 'Private failed-input content' })
      ).rejects.toThrow();
    });

    expect(mockCapture).not.toHaveBeenCalled();
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
