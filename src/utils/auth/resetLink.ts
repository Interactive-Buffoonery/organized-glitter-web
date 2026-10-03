const LEGACY_RESET_HASH_PREFIX = '#/auth/confirm-password-reset/';

export function buildResetConfirmationPath(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  return `/auth/confirm-password-reset/${encodeURIComponent(token)}`;
}

export function getLegacyResetHashPath(hash: string): string | null {
  if (!hash.startsWith(LEGACY_RESET_HASH_PREFIX)) {
    return null;
  }

  const encodedToken = hash.slice(LEGACY_RESET_HASH_PREFIX.length);
  if (!encodedToken || encodedToken.includes('/')) {
    return null;
  }

  try {
    return buildResetConfirmationPath(decodeURIComponent(encodedToken));
  } catch {
    return null;
  }
}
