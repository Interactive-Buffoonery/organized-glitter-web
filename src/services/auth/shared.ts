import { pb } from '@/lib/pocketbase';
import { createLogger } from '@/utils/logger';

export const authLogger = createLogger('AuthService');

export const normalizeEmail = (email: string | undefined): string => {
  return email?.trim().toLowerCase() || '';
};

export type AuthConnectivity = {
  online: boolean;
  canReachServer: boolean;
};

export const getConnectivityWarning = (
  connectivity: AuthConnectivity
): 'offline' | 'unreachable' | null => {
  if (!connectivity.online) return 'offline';
  if (!connectivity.canReachServer) return 'unreachable';
  return null;
};

export const checkNetworkConnectivity = async (): Promise<AuthConnectivity> => {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!online) {
    return { online: false, canReachServer: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    await fetch(`${pb.baseURL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    return { online: true, canReachServer: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      authLogger.warn('PocketBase health check timed out');
    } else {
      authLogger.warn('Unable to reach PocketBase server');
    }
    return { online: true, canReachServer: false };
  } finally {
    clearTimeout(timeout);
  }
};
