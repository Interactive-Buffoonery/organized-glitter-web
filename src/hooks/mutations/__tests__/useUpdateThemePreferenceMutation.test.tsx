import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { createTestQueryClient } from '@/test-utils';
import TestWrapper from '@/test-utils/TestWrapper';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { UserDTO } from '@/services/types';

const { updateMock, notifyMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('@/services/pocketbase/users.service', () => ({
  UsersService: {
    update: updateMock,
  },
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { useUpdateThemePreferenceMutation } from '../useUpdateThemePreferenceMutation';

const user: UserDTO = {
  id: 'u1',
  email: 'test@example.com',
  username: 'testuser',
  avatar: '',
  timezone: 'UTC',
  themePreference: 'system',
  betaTester: false,
  verified: true,
  emailVisibility: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('useUpdateThemePreferenceMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically updates and persists the theme preference', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.user.profile('u1'), user);
    updateMock.mockResolvedValue({ ...user, themePreference: 'dark' });

    const { result } = renderHook(() => useUpdateThemePreferenceMutation(), {
      wrapper: ({ children }) => <TestWrapper queryClient={queryClient}>{children}</TestWrapper>,
    });

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'u1',
        themePreference: 'dark',
      });
    });

    expect(updateMock).toHaveBeenCalledWith('u1', {
      theme_preference: 'dark',
    });
    expect(queryClient.getQueryData<UserDTO>(queryKeys.user.profile('u1'))?.themePreference).toBe(
      'dark'
    );
  });

  it('rolls back and notifies when persistence fails', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.user.profile('u1'), user);
    updateMock.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useUpdateThemePreferenceMutation(), {
      wrapper: ({ children }) => <TestWrapper queryClient={queryClient}>{children}</TestWrapper>,
    });

    await expect(
      result.current.mutateAsync({
        userId: 'u1',
        themePreference: 'light',
      })
    ).rejects.toThrow('nope');

    await waitFor(() => {
      expect(queryClient.getQueryData<UserDTO>(queryKeys.user.profile('u1'))).toEqual(user);
    });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        title: 'Theme Update Failed',
      })
    );
  });
});
