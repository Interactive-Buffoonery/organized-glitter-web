import { act, beforeEach, expect, it, renderHookWithProviders } from '@/test-utils';
import { createTestQueryClient } from '@/test-utils';
import { vi } from 'vitest';

const { mark, unmark, notify } = vi.hoisted(() => ({
  mark: vi.fn(),
  unmark: vi.fn(),
  notify: vi.fn(),
}));
vi.doMock('@/services/pocketbase/craftingStreak.service', () => ({
  CraftingStreakService: { mark, unmark },
}));
vi.doMock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.doMock('@/lib/notifications', () => ({ notify }));

const { useMarkCraftingDay, useUnmarkCraftingDay } = await import('../useCraftingDayMarks');
const { queryKeys } = await import('@/hooks/queries/queryKeys');

const key = queryKeys.notesFeed.streak('user-1');
const history = { noteDates: [], slots: [], marks: [{ id: 'm1', day: '2026-11-10' }] };

const cachedClient = () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(key, { gcTime: Infinity });
  queryClient.setQueryData(key, history);
  return queryClient;
};

beforeEach(() => vi.clearAllMocks());

it('adds a new mark to the cached history', async () => {
  const queryClient = cachedClient();
  mark.mockResolvedValue({ id: 'm2', day: '2026-11-12' });
  const { result } = renderHookWithProviders(() => useMarkCraftingDay(), { queryClient });
  await act(() => result.current.mutateAsync('2026-11-12'));
  expect(mark).toHaveBeenCalledWith('user-1', '2026-11-12');
  expect(queryClient.getQueryData<typeof history>(key)?.marks).toEqual([
    { id: 'm1', day: '2026-11-10' },
    { id: 'm2', day: '2026-11-12' },
  ]);
});

it('removes an unmarked day from the cached history', async () => {
  const queryClient = cachedClient();
  unmark.mockResolvedValue(undefined);
  const { result } = renderHookWithProviders(() => useUnmarkCraftingDay(), { queryClient });
  await act(() => result.current.mutateAsync('m1'));
  expect(unmark).toHaveBeenCalledWith('m1');
  expect(queryClient.getQueryData<typeof history>(key)?.marks).toEqual([]);
});

it('reports a failure through notifications', async () => {
  const queryClient = createTestQueryClient();
  mark.mockRejectedValue(new Error('offline'));
  const { result } = renderHookWithProviders(() => useMarkCraftingDay(), { queryClient });
  await act(async () => {
    await expect(result.current.mutateAsync('2026-11-12')).rejects.toThrow();
  });
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
});
