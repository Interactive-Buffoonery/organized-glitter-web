import { useEffect } from 'react';
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '@/lib/notifications';
import { setupErrorHandler } from '@/utils/error/rateLimitNotifier';
import { setupGlobalAuthClear } from '@/services/auth';
import { createLogger } from '@/utils/logger';

type ToastType = 'error' | 'warning' | 'success' | 'info';

/**
 * Application initialization hook that sets up global services
 * Handles error handlers and auth helpers
 */
export const useAppInitialization = (): void => {
  const logger = createLogger('AppInitialization');

  // Setup global services
  useEffect(() => {
    let reloadTimeout: ReturnType<typeof setTimeout> | undefined;

    // Setup global auth clear function for debugging
    const cleanupGlobalAuthClear = setupGlobalAuthClear();

    // Setup global error handler with toast notifications
    const cleanupErrorHandler = setupErrorHandler((message: string, type: ToastType) => {
      switch (type) {
        case 'error':
          notifyError('App error', message);
          break;
        case 'warning':
          notifyWarning('App warning', message);
          break;
        case 'success':
          notifySuccess('Action completed', message);
          break;
        case 'info':
        default:
          notifyInfo('App notice', message);
      }
    });

    // NOTE: Global error capture is handled by setupGlobalErrorHandlers() in
    // fatalErrorHandler.ts (called from main.tsx), so we do NOT call
    // posthog.captureException here.  Doing so would double-count every
    // uncaught error and unhandled rejection in PostHog.

    // Handle unhandled promise rejections (chunk loading errors)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (import.meta.env.DEV) {
        logger.error('Unhandled rejection:', event.reason);
      }

      // DIAGNOSTIC: Check for React Query queryKey errors
      const reason = event.reason?.message || event.reason?.toString() || '';
      if (reason.includes("Cannot read properties of undefined (reading 'queryKey')")) {
        logger.criticalError(
          '🚨 CRITICAL: React Query queryKey undefined error detected in production!',
          {
            reason: event.reason,
            stack: event.reason?.stack,
            timestamp: new Date().toISOString(),
          }
        );
      }

      // For chunk loading errors, reload the page
      if (reason.includes('text/html') || reason.includes('MIME type')) {
        if (import.meta.env.DEV) {
          logger.log('Chunk loading error detected, reloading page...');
        }
        reloadTimeout ??= setTimeout(() => {
          reloadTimeout = undefined;
          window.location.reload();
        }, 1000);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      clearTimeout(reloadTimeout);
      cleanupGlobalAuthClear();
      cleanupErrorHandler();
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- logger is stable
};
