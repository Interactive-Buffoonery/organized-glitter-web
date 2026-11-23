import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCreateTag } from '../useCreateTag';
import { useUpdateTag } from '../useUpdateTag';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({ notify: mocks.notify }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/services/pocketbase/tags.service', () => ({
  TagService: { createTag: mocks.createTag, updateTag: mocks.updateTag },
}));

const duplicate = {
  status: 'error',
  data: null,
  error: new Error('A tag named "cats" already exists.'),
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('tag duplicate name notifications', () => {
  it.each([
    ['create', () => useCreateTag(), { name: 'CATS' }, mocks.createTag],
    [
      'rename',
      () => useUpdateTag(),
      { id: 'tag-dogs', updates: { name: 'CATS' } },
      mocks.updateTag,
    ],
  ] as const)('names the existing tag on %s', async (_label, useHook, input, serviceCall) => {
    mocks.notify.mockClear();
    serviceCall.mockResolvedValue(duplicate);
    const { result } = renderHook(useHook, { wrapper });

    await act(async () => {
      // @ts-expect-error each hook takes its own input shape
      result.current.mutate(input);
    });

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith({
        kind: 'error',
        title: 'Tag name already exists',
        description: 'A tag named "cats" already exists.',
      })
    );
  });
});
