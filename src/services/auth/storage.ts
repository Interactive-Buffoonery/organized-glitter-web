import { pb } from '@/lib/pocketbase';
import { authLogger } from './shared';

const clearAllAuthData = async (): Promise<void> => {
  try {
    pb.authStore.clear();

    const localStorageKeysToRemove = Object.keys(localStorage).filter(
      key =>
        key.startsWith('pocketbase_auth') ||
        key.startsWith('pb_') ||
        key.startsWith('diamond-art-auth-token') ||
        key === 'pocketbase_auth_token'
    );

    localStorageKeysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    const sessionStorageKeysToRemove = Object.keys(sessionStorage).filter(
      key =>
        key.startsWith('pocketbase_auth') ||
        key.startsWith('pb_') ||
        key.startsWith('diamond-art-auth-token') ||
        key === 'pocketbase_auth_token'
    );

    sessionStorageKeysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
    });

    authLogger.debug('Successfully cleared all auth data');
  } catch (error) {
    authLogger.error('Error clearing auth data:', error);
    throw error;
  }
};

export const setupGlobalAuthClear = (): (() => void) => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return () => undefined;

  const debugWindow = window as Window & {
    clearOrganizedGlitterAuth?: () => Promise<void>;
  };
  debugWindow.clearOrganizedGlitterAuth = clearAllAuthData;
  authLogger.debug('Global auth clear function available: window.clearOrganizedGlitterAuth()');

  return () => {
    if (debugWindow.clearOrganizedGlitterAuth === clearAllAuthData) {
      delete debugWindow.clearOrganizedGlitterAuth;
    }
  };
};
