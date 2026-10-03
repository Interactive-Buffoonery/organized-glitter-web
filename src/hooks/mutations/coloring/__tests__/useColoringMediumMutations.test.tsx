import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';

import { useUpdateColoringMedium } from '../useColoringMediumMutations';

vi.mock('@/services/pocketbase/coloringMediums.service', () => ({
  ColoringMediumsService: {
    updateColoringMedium: vi.fn(),
  },
}));
vi.mock('@/services/analytics-escape-hatch', () => ({ capture: vi.fn() }));

const oldMedium: ColoringMediumRecord = {
  id: 'medium-1',
  userId: 'user-1',
  name: 'Old name',
  type: 'colored_pencil',
  brand: 'Brand',
  colorCount: 24,
  notes: '',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('useUpdateColoringMedium', () => {
  it('writes the authoritative result into cached medium lists', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const queryKey = queryKeys.coloring.mediums.list('user-1');
    queryClient.setQueryData(queryKey, {
      items: [oldMedium],
      totalItems: 1,
      totalPages: 1,
    });
    const updated = {
      ...oldMedium,
      name: 'Updated name',
      updatedAt: '2026-01-02T00:00:00Z',
    };
    vi.mocked(ColoringMediumsService.updateColoringMedium).mockResolvedValue(updated);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateColoringMedium(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: oldMedium.id,
        input: { name: updated.name },
      });
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      items: [updated],
      totalItems: 1,
      totalPages: 1,
    });
  });
});
