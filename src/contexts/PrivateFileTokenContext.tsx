import { useEffect, useState, type ReactNode } from 'react';
import { PrivateFilesService } from '@/services/pocketbase/privateFiles.service';
import { useAuth } from '@/hooks/useAuth';
import { createLogger } from '@/utils/logger';
import { PrivateFileTokenContext, type FileToken } from './privateFileTokenState';

const logger = createLogger('PrivateFileToken');
const REFRESH_AFTER_MS = 90_000;
const RETRY_AFTER_MS = 10_000;
const MAX_TOKEN_AGE_MS = 110_000;

function scheduleTokenTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, delay);
}

export function PrivateFileTokenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [token, setToken] = useState<FileToken | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<string | null> | undefined;
    let issuedAt = 0;
    let currentValue: string | undefined;
    let lastErrorRefreshValue: string | undefined;
    let lastErrorRefresh: Promise<string | null> | undefined;

    const refreshOnError = (failedToken: string) => {
      if (!active || failedToken !== currentValue) return Promise.resolve(currentValue ?? null);
      if (lastErrorRefreshValue === failedToken) {
        return lastErrorRefresh ?? Promise.resolve(currentValue ?? null);
      }
      lastErrorRefreshValue = failedToken;
      lastErrorRefresh = pending
        ? pending.then(value => (value && value !== failedToken ? value : refresh()))
        : refresh();
      return lastErrorRefresh;
    };

    const refresh = () => {
      if (!userId || !active) return Promise.resolve(null);
      if (pending) return pending;
      pending = PrivateFilesService.getToken()
        .then(value => {
          if (!active || PrivateFilesService.getCurrentUserId() !== userId) return null;
          if (!value) throw new Error('PocketBase returned an empty file token');
          issuedAt = Date.now();
          currentValue = value;
          setToken({ userId, value, issuedAt, refreshOnError });
          clearTimeout(timer);
          timer = scheduleTokenTimer(refresh, REFRESH_AFTER_MS);
          clearTimeout(expiryTimer);
          expiryTimer = scheduleTokenTimer(() => setToken(null), MAX_TOKEN_AGE_MS);
          return value;
        })
        .catch(error => {
          if (!active) return null;
          setToken(null);
          clearTimeout(expiryTimer);
          logger.error('Could not refresh private file access', error);
          clearTimeout(timer);
          timer = scheduleTokenTimer(refresh, RETRY_AFTER_MS);
          return null;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    };

    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible' && Date.now() - issuedAt >= REFRESH_AFTER_MS) {
        refresh();
      }
    };

    if (userId) {
      refresh();
      document.addEventListener('visibilitychange', refreshOnReturn);
      window.addEventListener('focus', refreshOnReturn);
    }

    return () => {
      active = false;
      setToken(null);
      clearTimeout(timer);
      clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
    };
  }, [userId]);

  // Ignore a previous account's token during the render before its effect cleanup runs.
  const currentToken =
    token && token.userId === userId && Date.now() - token.issuedAt < MAX_TOKEN_AGE_MS
      ? token
      : null;

  return (
    <PrivateFileTokenContext.Provider value={currentToken}>
      {children}
    </PrivateFileTokenContext.Provider>
  );
}
