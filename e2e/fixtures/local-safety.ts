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

export const getLocalE2ETargetDisposition = ({
  suite,
  ...targets
}: {
  appUrl: string | undefined;
  pocketBaseUrl: string | undefined;
  specName: string;
  suite: string | undefined;
}): { action: 'allow' | 'fail' | 'skip'; reason: string | null } => {
  const reason = getLocalE2ESkipReason(targets);
  if (!reason) return { action: 'allow', reason: null };

  return {
    action: suite === 'smoke' || suite === 'full' ? 'fail' : 'skip',
    reason,
  };
};

export const getRequiredFixtureAction = ({
  ci,
  suite,
}: {
  ci: boolean;
  suite: string | undefined;
}): 'fail' | 'skip' => (ci || suite === 'smoke' || suite === 'full' ? 'fail' : 'skip');

export const requireFixtureOrSkip = (message: string): never => {
  const action = getRequiredFixtureAction({
    ci: Boolean(process.env.CI),
    suite: process.env.E2E_QA_SUITE,
  });
  if (action === 'fail') throw new Error(message);

  test.skip(true, message);
};

/**
 * Refuse mutating E2E work against non-loopback app/PocketBase URLs.
 * Managed local smoke/full runs fail when their target contract is broken.
 * Hosted preview runs skip instead, so they stay readable while mutations
 * remain blocked.
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
  const disposition = getLocalE2ETargetDisposition({
    appUrl,
    pocketBaseUrl,
    specName,
    suite: process.env.E2E_QA_SUITE,
  });
  if (disposition.action === 'fail') {
    throw new Error(disposition.reason ?? `${specName} requires local E2E targets.`);
  }
  if (disposition.action === 'skip') {
    test.skip(true, disposition.reason ?? `${specName} only runs against local E2E targets.`);
  }
};
