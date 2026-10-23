import { afterEach, expect, it, vi } from 'vitest';
import { clearSessionDrafts, subscribeToInvalidSession } from '../sessionRecovery';

vi.mock('@/lib/pocketbase', () => ({
  pb: { authStore: { isValid: false, token: 'expired-token', record: { id: 'account-a' } } },
}));

const { isAuthenticated } = await import('../state');

afterEach(() => clearSessionDrafts());

it('starts recovery when an auth guard finds an expired token', () => {
  const invalidSession = vi.fn();
  const unsubscribe = subscribeToInvalidSession(invalidSession);

  expect(isAuthenticated()).toBe(false);
  expect(invalidSession).toHaveBeenCalledWith('expired-token');

  unsubscribe();
});
