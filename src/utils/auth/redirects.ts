import { createPath } from 'react-router-dom';

export type AuthRedirectState = {
  sessionExpired?: boolean;
  from?: {
    pathname: string;
    search?: string;
    hash?: string;
  };
};

type SanitizedAuthRedirectLocation = NonNullable<AuthRedirectState['from']>;

const DEFAULT_AUTH_REDIRECT = '/overview';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeSearchOrHash(value: unknown, prefix: '?' | '#'): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  if (value === '' || value.startsWith(prefix)) {
    return value;
  }

  return null;
}

function sanitizeAuthRedirectLocation(state: unknown): SanitizedAuthRedirectLocation | undefined {
  if (!isRecord(state) || !isRecord(state.from)) {
    return undefined;
  }

  const pathname = state.from.pathname;
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    return undefined;
  }

  const search = sanitizeSearchOrHash(state.from.search, '?');
  if (search === null) {
    return undefined;
  }

  const hash = sanitizeSearchOrHash(state.from.hash, '#');
  if (hash === null) {
    return undefined;
  }

  return {
    pathname,
    ...(search !== undefined ? { search } : {}),
    ...(hash !== undefined ? { hash } : {}),
  };
}

export function resolveAuthRedirectDestination(
  state: unknown,
  fallback: string = DEFAULT_AUTH_REDIRECT
): string {
  const destination = sanitizeAuthRedirectLocation(state);
  return destination ? createPath(destination) : fallback;
}

export function extractAuthRedirectState(state: unknown): AuthRedirectState | undefined {
  const destination = sanitizeAuthRedirectLocation(state);
  return destination
    ? {
        from: destination,
        ...(isRecord(state) && state.sessionExpired === true ? { sessionExpired: true } : {}),
      }
    : undefined;
}
