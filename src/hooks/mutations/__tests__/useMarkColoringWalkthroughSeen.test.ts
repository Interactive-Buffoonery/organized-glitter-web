import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { markSeenMock } = vi.hoisted(() => ({
  markSeenMock: vi.fn(),
}));

vi.mock('@/services/pocketbase/users.service', () => ({
  UsersService: {
    markColoringWalkthroughSeen: markSeenMock,
  },
}));

import { useMarkColoringWalkthroughSeen } from '../useMarkColoringWalkthroughSeen';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe('useMarkColoringWalkthroughSeen', () => {
  beforeEach(() => {
    markSeenMock.mockReset();
  });

  it('marks the user walkthrough as seen on success', async () => {
    markSeenMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMarkColoringWalkthroughSeen('user-1'), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(markSeenMock).toHaveBeenCalledWith('user-1');
  });

  it('errors when marking seen rejects', async () => {
    markSeenMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useMarkColoringWalkthroughSeen('user-1'), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('throws when no user id is provided', async () => {
    const { result } = renderHook(() => useMarkColoringWalkthroughSeen(undefined), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(markSeenMock).not.toHaveBeenCalled();
  });
});
