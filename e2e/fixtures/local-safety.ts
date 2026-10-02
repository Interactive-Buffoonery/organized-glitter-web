import { test } from '@playwright/test';

// Node and browsers disagree on IPv6 hostname brackets; accept both.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const isLocalUrl = (value: string | undefined) => {
  if (!value) return false;

  try {
    const url = new URL(value);
    return LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

export const getLocalE2ESkipReason = ({
  appUrl,
  pocketBaseUrl,
  specName,
}: {
  appUrl: string | undefined;
  pocketBaseUrl: string | undefined;
  specName: string;
}): string | null => {
  if (isLocalUrl(appUrl) && isLocalUrl(pocketBaseUrl)) {
    return null;
  }

  return [
    `${specName} mutates data and only runs against localhost targets.`,
    `APP URL: ${appUrl || '(missing)'}`,
    `PocketBase URL: ${pocketBaseUrl || '(missing)'}`,
  ].join('\n');
};

/**
 * Refuse mutating E2E work against non-loopback app/PocketBase URLs.
 * Skips the current test (or suite hook) instead of failing, so hosted
 * preview runs stay readable while still blocking mutations.
 */
export const assertLocalE2ETargets = ({
  appUrl,
  pocketBaseUrl,
  specName,
}: {
  appUrl: string | undefined;
  pocketBaseUrl: string | undefined;
  specName: string;
}) => {
  const reason = getLocalE2ESkipReason({ appUrl, pocketBaseUrl, specName });
  if (reason) {
    test.skip(true, reason);
  }
};
