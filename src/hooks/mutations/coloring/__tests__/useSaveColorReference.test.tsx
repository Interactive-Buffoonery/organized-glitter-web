import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useSaveColorReference } from '../useSaveColorReference';
import { colorReferenceKey } from '@/hooks/queries/coloring/useColorReference';

const state = vi.hoisted(() => ({ save: vi.fn(), userId: 'owner' }));
vi.mock('@/services/pocketbase/colorReferences.service', () => ({
  ColorReferencesService: { save: state.save },
}));
vi.mock('@/services/auth', () => ({ getCurrentUserId: () => state.userId }));

describe('color reference save cache boundary', () => {
  it('keeps a successful write successful when refresh fails', async () => {
    const client = new QueryClient();
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('Refresh failed'));
    const record = { id: 'reference', notes: '001', photos: [] };
    state.save.mockResolvedValue(record);
    const { result } = renderHook(() => useSaveColorReference('page', 'owner'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ action: 'notes', notes: '001', baselineNotes: '' })
      ).resolves.toEqual(record);
    });
    expect(client.getQueryData(colorReferenceKey('owner', 'page'))).toEqual(record);
  });
  it('refreshes a conflicting note so reopening uses the saved baseline', async () => {
    const client = new QueryClient();
    const key = colorReferenceKey('owner', 'page');
    const current = { id: 'reference', notes: 'Saved in another tab', photos: [] };
    client.setQueryDefaults(key, { queryFn: async () => current, staleTime: 300_000 });
    client.setQueryData(key, { ...current, notes: 'Old baseline' });
    const conflict = Object.assign(new Error('Notes changed'), { status: 409 });
    state.save.mockRejectedValue(conflict);
    const { result } = renderHook(() => useSaveColorReference('page', 'owner'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          action: 'notes',
          notes: 'Draft',
          baselineNotes: 'Old baseline',
        })
      ).rejects.toBe(conflict);
    });
    expect(client.getQueryData(key)).toEqual(current);
  });
  it('does not repopulate an old account cache after signing out', async () => {
    const client = new QueryClient();
    state.userId = 'other';
    state.save.mockResolvedValue({ id: 'private' });
    const { result } = renderHook(() => useSaveColorReference('page', 'owner'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      await result.current.mutateAsync({ action: 'notes', notes: '001', baselineNotes: '' });
    });
    expect(client.getQueryData(colorReferenceKey('owner', 'page'))).toBeUndefined();
    state.userId = 'owner';
  });
});
