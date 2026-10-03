import { pb } from '@/lib/pocketbase';
import type { PocketBaseUser } from '@/contexts/AuthContext';
import { authLogger } from './shared';
import { reportInvalidSession } from './sessionRecovery';

const AUTH_ERROR_MESSAGE = 'User not authenticated.';

class AuthenticationError extends Error {
  constructor(message: string = AUTH_ERROR_MESSAGE) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export const isAuthenticated = (): boolean => {
  return getAuthToken() !== null;
};

export const getAuthToken = (): string | null => {
  if (!pb.authStore.isValid) {
    if (pb.authStore.token) reportInvalidSession(pb.authStore.token);
    return null;
  }
  return pb.authStore.token || null;
};

export const getCurrentUser = (): PocketBaseUser | null => {
  if (!getAuthToken() || !pb.authStore.record) return null;
  return pb.authStore.record as unknown as PocketBaseUser;
};

export const getCurrentUserId = (): string | null => {
  if (!getAuthToken()) return null;
  return pb.authStore.record?.id || null;
};

export const getCurrentUserEmail = (): string | null => {
  if (!getAuthToken()) return null;
  return (pb.authStore.record as Record<string, unknown> | null)?.email as string | null;
};

export const logout = (): void => {
  pb.authStore.clear();
  authLogger.debug('User logged out');
};

export const onAuthChange = (
  callback: (token: string, user: PocketBaseUser | null) => void,
  fireImmediately?: boolean
): (() => void) => {
  return pb.authStore.onChange((token, record) => {
    callback(token, record as unknown as PocketBaseUser | null);
  }, fireImmediately);
};

export function requireAuthenticatedUser(user: PocketBaseUser | null | undefined): string {
  if (!user?.id) {
    throw new AuthenticationError();
  }
  return user.id;
}
