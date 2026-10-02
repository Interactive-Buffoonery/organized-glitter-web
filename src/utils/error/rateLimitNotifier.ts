import { handleRateLimitError as checkRateLimit, RateLimitInfo } from './rateLimit';
import { logger } from '@/utils/logger';

type NotificationHandler = (
  message: string,
  type: 'error' | 'warning' | 'info' | 'success'
) => void;

let notificationHandler: NotificationHandler | null = null;

/**
 * Sets up the global error handler
 * @param handler Function to handle notifications
 */
export function setupErrorHandler(handler: NotificationHandler) {
  notificationHandler = handler;

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  // Handle uncaught exceptions
  window.addEventListener('error', handleError);

  return () => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.removeEventListener('error', handleError);
    if (notificationHandler === handler) {
      notificationHandler = null;
    }
  };
}

/**
 * Handles unhandled promise rejections
 */
async function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const error = event.reason;
  const rateLimitInfo = checkRateLimit(error);

  if (rateLimitInfo) {
    event.preventDefault();
    showNotification(rateLimitInfo);
  }
}

/**
 * Handles uncaught exceptions
 */
function handleError(event: ErrorEvent) {
  const error = event.error;
  const rateLimitInfo = checkRateLimit(error);

  if (rateLimitInfo) {
    event.preventDefault();
    showNotification(rateLimitInfo);
    return true; // Prevent default error handling
  }

  return false;
}

/**
 * Shows a notification to the user
 */
function showNotification(rateLimitInfo: RateLimitInfo) {
  if (notificationHandler) {
    notificationHandler(rateLimitInfo.message, 'warning');
  } else {
    logger.warn('Rate limited:', rateLimitInfo.message);
  }
}
