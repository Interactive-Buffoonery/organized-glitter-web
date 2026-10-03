import PocketBase from 'pocketbase';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { createLogger } from '@/utils/logger';
import type { TypedPocketBase } from '@/types/pocketbase.types';
import {
  isSessionTokenInactive,
  recordCompletedSessionCreate,
  reportInvalidSession,
  SessionChangedError,
} from '@/services/auth/sessionRecovery';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';

const pbLogger = createLogger('PocketBase');

// Validate environment variables
if (!POCKETBASE_URL) {
  pbLogger.error('❌ CRITICAL: Missing PocketBase URL configuration');
  throw new Error('PocketBase URL not configured');
}

pbLogger.debug('PocketBase Environment:', {
  url: POCKETBASE_URL,
  isLocal: POCKETBASE_URL.includes('localhost') || POCKETBASE_URL.includes('127.0.0.1'),
  nodeEnv: import.meta.env.NODE_ENV,
  mode: import.meta.env.MODE,
  hasUrl: !!POCKETBASE_URL,
});

// Create and configure PocketBase client
export const pb = new PocketBase(POCKETBASE_URL) as TypedPocketBase;

// Disable PocketBase SDK auto-cancellation in all environments.
// React Query coordinates request lifecycle (caching, dedup, AbortSignal).
// Letting PocketBase auto-cancel parallel requests caused #108 in production:
// invalidation-triggered refetches were aborted by other in-flight reads
// sharing the same default requestKey ("GET /api/collections/<name>/records").
pb.autoCancellation(false);

if (import.meta.env.DEV || __APP_TEST_ENV__ === 'test') {
  // Make PocketBase client available for debugging
  if (typeof window !== 'undefined') {
    (window as Window & { __pb?: TypedPocketBase; pb?: TypedPocketBase }).__pb = pb;
    (window as Window & { __pb?: TypedPocketBase; pb?: TypedPocketBase }).pb = pb;
    pbLogger.debug('PocketBase client available as window.pb for debugging');
  }
}

// Rate limiting state - optimized for authenticated users
let lastRequestTime = 0;
let consecutiveRateLimits = 0;
const baseInterval = 10; // Reduced from 50ms - much more responsive for authenticated users

function getRateLimitRouteLabel(url: string): string {
  try {
    const pathname = new URL(url).pathname;

    if (pathname === '/api/batch') return '/api/batch';
    if (pathname.endsWith('/auth-with-password'))
      return '/api/collections/:collection/auth-with-password';
    if (pathname.endsWith('/auth-with-oauth2'))
      return '/api/collections/:collection/auth-with-oauth2';
    if (pathname.endsWith('/request-password-reset')) {
      return '/api/collections/:collection/request-password-reset';
    }
    if (pathname.endsWith('/confirm-password-reset')) {
      return '/api/collections/:collection/confirm-password-reset';
    }
    if (pathname.endsWith('/request-verification')) {
      return '/api/collections/:collection/request-verification';
    }
    if (pathname.endsWith('/confirm-verification')) {
      return '/api/collections/:collection/confirm-verification';
    }
    if (pathname.includes('/api/collections/') && pathname.endsWith('/records')) {
      return '/api/collections/:collection/records';
    }
    if (pathname.includes('/api/collections/') && pathname.includes('/records/')) {
      return '/api/collections/:collection/records/:id';
    }
    if (pathname.startsWith('/api/')) return '/api/';

    return 'other';
  } catch {
    return 'unknown';
  }
}

function getConsecutiveRateLimitBucket(count: number): string {
  if (count <= 1) return '1';
  if (count <= 3) return '2-3';
  if (count <= 10) return '4-10';
  return '11+';
}

// Dynamic rate limiting that increases after 429s
const getMinRequestInterval = () => {
  // For authenticated users, use minimal rate limiting unless we hit 429s
  const isAuthenticated = pb.authStore.isValid;

  if (consecutiveRateLimits === 0) {
    // No recent rate limits - use minimal delay for authenticated users
    return isAuthenticated ? 0 : baseInterval;
  }

  // Exponential backoff after 429s: 20ms, 40ms, 80ms, 160ms, 320ms, max 1s for auth users
  // For non-auth: 100ms, 200ms, 400ms, 800ms, 1.6s, max 5s
  const multiplier = isAuthenticated ? 2 : 10;
  const maxDelay = isAuthenticated ? 1000 : 5000;
  return Math.min(baseInterval * multiplier * Math.pow(2, consecutiveRateLimits - 1), maxDelay);
};

pb.beforeSend = function (url: string, options: RequestInit & Record<string, unknown>) {
  const pathname = new URL(url).pathname;
  const isAuthRequest =
    pathname.includes('/auth-') || pathname.includes('/request-') || pathname.includes('/confirm-');
  const token = pb.authStore.token;
  if (!isAuthRequest && token && !pb.authStore.isValid) {
    reportInvalidSession(token);
    throw new Error('Your session expired. Sign in and try again.');
  }

  // Add rate limiting with dynamic intervals
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minInterval = getMinRequestInterval();

  if (timeSinceLastRequest < minInterval) {
    const delay = minInterval - timeSinceLastRequest;
    if (import.meta.env.DEV && delay > 5) {
      const isAuth = pb.authStore.isValid;
      pbLogger.debug(`Rate limiting delay: ${delay}ms for ${url} (auth: ${isAuth})`);
    }
    return new Promise(resolve => {
      setTimeout(() => {
        lastRequestTime = Date.now();
        resolve({ url, options });
      }, delay);
    });
  }

  lastRequestTime = now;
  return { url, options };
};

pb.afterSend = function (
  response: Response,
  data: unknown,
  options?: { headers?: HeadersInit; method?: string }
): unknown {
  const requestToken = new Headers(options?.headers)
    .get('Authorization')
    ?.replace(/^Bearer\s+/i, '');
  if (
    response.ok &&
    requestToken &&
    isSessionTokenInactive(requestToken) &&
    options?.method?.toUpperCase() !== 'GET'
  ) {
    if (options?.method?.toUpperCase() === 'POST') {
      const collection = new URL(response.url || '/', pb.baseURL).pathname.match(
        /^\/api\/collections\/([^/]+)\/records$/
      )?.[1];
      const id = typeof data === 'object' && data !== null && 'id' in data ? data.id : undefined;
      if (collection && typeof id === 'string') {
        recordCompletedSessionCreate(requestToken, collection, id);
      }
    }
    throw new SessionChangedError();
  }
  if (
    response.status === 401 &&
    requestToken &&
    requestToken === pb.authStore.token &&
    !new URL(response.url || '/', pb.baseURL).pathname.includes('/auth-')
  ) {
    reportInvalidSession(requestToken);
  }
  // Handle 429 rate limit responses with exponential backoff
  if (response.status === 429) {
    consecutiveRateLimits++;
    capture(AnalyticsEvent.API_RATE_LIMITED, {
      auth_state: pb.authStore.isValid ? 'authenticated' : 'guest',
      consecutive_rate_limit_bucket: getConsecutiveRateLimitBucket(consecutiveRateLimits),
      route_label: getRateLimitRouteLabel(response.url),
    });
    pbLogger.warn(`Rate limit hit (${consecutiveRateLimits} consecutive):`, {
      status: response.status,
      nextInterval: getMinRequestInterval(),
    });
  } else if (response.status >= 200 && response.status < 300) {
    // Reset counter on successful requests
    if (consecutiveRateLimits > 0) {
      pbLogger.info('Rate limit cleared, resetting interval');
      consecutiveRateLimits = 0;
    }
  } else if (response.status >= 400) {
    // Log client/server errors for debugging
    pbLogger.warn(`Request failed with status ${response.status}:`, {
      url: response.url,
      status: response.status,
    });
  }
  return data;
};

// Configure auth store options for better security
pb.authStore.onChange((_token, record) => {
  if (import.meta.env.DEV) {
    pbLogger.debug('Auth state changed:', {
      isValid: pb.authStore.isValid,
      hasRecord: !!record,
      userId: record?.id || null,
    });
  }
});

// Helper function to get file URL with validation
export const getFileUrl = (
  record: { id: string; [key: string]: unknown },
  filename: string,
  thumb?: string
): string => {
  if (!record || !filename) return '';

  // Handle case where filename is already a relative path starting with '/'
  if (typeof filename === 'string' && filename.startsWith('/') && !filename.startsWith('//')) {
    pbLogger.warn('Detected relative path filename, this may cause 404 errors:', filename);
    // Extract just the filename from the path
    const actualFilename = filename.split('/').pop();
    if (!actualFilename) return '';
    filename = actualFilename;
  }

  const url = pb.files.getURL(record, filename, thumb ? { thumb } : undefined);

  // Validate the generated URL is absolute
  if (url && !url.startsWith('http') && !url.startsWith('//')) {
    pbLogger.error('Generated non-absolute URL for file:', { record: record.id, filename, url });
    return '';
  }

  return url;
};

/**
 * Resolve a file URL from collection, record ID, and filename.
 * SDK-agnostic alternative to getFileUrl; does not require a full PocketBase record.
 */
export const resolveFileUrl = (
  collectionNameOrId: string,
  recordId: string,
  filename: string,
  thumb?: string
): string => {
  if (!recordId || !filename) return '';
  return getFileUrl(
    { id: recordId, collectionId: collectionNameOrId, collectionName: collectionNameOrId },
    filename,
    thumb
  );
};

// Export PocketBase client configuration
export const getPocketBaseConfig = () => ({
  url: POCKETBASE_URL,
  isLocal: POCKETBASE_URL.includes('localhost') || POCKETBASE_URL.includes('127.0.0.1'),
});

// Auth helpers (isAuthenticated, getCurrentUser, getCurrentUserId, logout)
// have moved to @/services/auth. Import from there instead.
