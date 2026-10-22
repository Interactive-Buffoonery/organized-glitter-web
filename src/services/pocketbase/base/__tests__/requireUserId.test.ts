import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/services/auth', () => ({
  isAuthenticated: vi.fn(),
  getCurrentUserId: vi.fn(),
}));

import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import { requireUserId } from '../requireUserId';

const authError = { type: 'auth', message: 'User not authenticated', retryable: false };

beforeEach(() => {
  vi.mocked(isAuthenticated).mockReturnValue(true);
  vi.mocked(getCurrentUserId).mockReturnValue('user-1');
});

it('returns the signed-in user ID', () => {
  expect(requireUserId()).toBe('user-1');
  expect(requireUserId('user-1')).toBe('user-1');
});

it('rejects a missing session or user ID', () => {
  vi.mocked(isAuthenticated).mockReturnValue(false);
  expect(() => requireUserId()).toThrow(expect.objectContaining(authError));

  vi.mocked(isAuthenticated).mockReturnValue(true);
  vi.mocked(getCurrentUserId).mockReturnValue(null);
  expect(() => requireUserId()).toThrow(expect.objectContaining(authError));
});

it('rejects a different signed-in user than expected', () => {
  expect(() => requireUserId('user-2')).toThrow(expect.objectContaining(authError));
});
