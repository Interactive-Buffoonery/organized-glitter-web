import { afterEach, expect, it, vi } from 'vitest';
import { clearSessionDrafts, subscribeToInvalidSession } from '../sessionRecovery';

vi.mock('@/lib/pocketbase', () => ({
  pb: { authStore: { isValid: false, token: 'expired-token', record: { id: 'account-a' } } },
}));

const { isAuthenticated, getAuthToken, getCurrentUser, getCurrentUserId, getCurrentUserEmail } =
  await import('../state');

afterEach(() => clearSessionDrafts());

it('starts recovery when an auth guard finds an expired token', () => {
  const invalidSession = vi.fn();
  const unsubscribe = subscribeToInvalidSession(invalidSession);

  expect(isAuthenticated()).toBe(false);
  expect(invalidSession).toHaveBeenCalledWith('expired-token');

  unsubscribe();
});

it('reports an expired token when a direct authenticated request asks for it', () => {
  const invalidSession = vi.fn();
  const unsubscribe = subscribeToInvalidSession(invalidSession);

  expect(getAuthToken()).toBeNull();
  expect(invalidSession).toHaveBeenCalledWith('expired-token');

  unsubscribe();
});

it('starts recovery when a user ID lookup finds an expired token', () => {
  const invalidSession = vi.fn();
  const unsubscribe = subscribeToInvalidSession(invalidSession);

  expect(getCurrentUserId()).toBeNull();
  expect(invalidSession).toHaveBeenCalledWith('expired-token');

  unsubscribe();
});

it('starts recovery when a user record or email lookup finds an expired token', () => {
  const invalidSession = vi.fn();
  const unsubscribe = subscribeToInvalidSession(invalidSession);

  expect(getCurrentUser()).toBeNull();
  expect(getCurrentUserEmail()).toBeNull();
  expect(invalidSession).toHaveBeenCalledWith('expired-token');

  unsubscribe();
});
