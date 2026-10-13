import posthog from 'posthog-js';
import { getCurrentUser, onAuthChange } from '@/services/auth';
import { UsersService } from '@/services/pocketbase/users.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AnalyticsPreference');
export const ACCOUNT_CONSENT_STORAGE_KEY = 'og:analytics:account-consent';
const HEALTHY_PREFERENCE_REFRESH_MS = 5 * 60_000;
const PREFERENCE_RETRY_TICK_MS = 30_000;
let rememberedConsent: { accountId: string; enabled: boolean } | undefined;
const listeners = new Set<() => void>();
const saveSettledListeners = new Set<() => void>();
let state = {
  accountId: null as string | null,
  enabled: false,
  ready: false,
  saving: false,
  loadFailed: false,
};
let generation = 0;
let revision = 0;

export function getAnalyticsPreference() {
  return state;
}

export function getAnalyticsEnabled(): boolean {
  return state.ready && state.enabled && (getCurrentUser()?.id ?? null) === state.accountId;
}

export function syncAnalyticsConsent(): void {
  if (!posthog.config.token) return;
  if (getAnalyticsEnabled()) {
    const user = getCurrentUser();
    const existingAccount = posthog.get_property('$user_id');
    if (existingAccount && existingAccount !== user?.id) posthog.reset();
    posthog.opt_in_capturing({ captureEventName: false });
    if (user && posthog.get_distinct_id() !== user.id) {
      posthog.identify(user.id, { created: user.created });
    }
  } else {
    if (!getCurrentUser() && posthog.get_property('$user_id')) posthog.reset();
    posthog.opt_out_capturing();
  }
}

function rememberConsent(accountId: string, enabled: boolean): void {
  rememberedConsent = { accountId, enabled };
  try {
    localStorage.setItem(ACCOUNT_CONSENT_STORAGE_KEY, JSON.stringify(rememberedConsent));
  } catch {
    try {
      localStorage.removeItem(ACCOUNT_CONSENT_STORAGE_KEY);
    } catch {
      // Storage may be entirely blocked; the in-memory opt-out still takes precedence.
    }
    logger.warn('Could not store remembered analytics preference');
  }
}

function publish(next: typeof state): void {
  state = next;
  if (next.ready && next.accountId && !next.saving) {
    rememberConsent(next.accountId, next.enabled);
  }
  syncAnalyticsConsent();
  listeners.forEach(listener => listener());
}

export function subscribeAnalyticsPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSignedOutAnalyticsEnabled(): boolean {
  const isMemoryEnabled = rememberedConsent?.enabled !== false;
  if (!isMemoryEnabled) return false;
  try {
    const stored = localStorage.getItem(ACCOUNT_CONSENT_STORAGE_KEY);
    return stored ? JSON.parse(stored)?.enabled !== false : isMemoryEnabled;
  } catch {
    logger.debug('Could not read remembered analytics preference');
    return isMemoryEnabled;
  }
}

export function initializeAnalyticsPreference(): () => void {
  let active = true;
  let unsubscribeRecord: (() => Promise<void>) | undefined;
  let unsubscribeConnect: (() => Promise<void>) | undefined;
  const stopSubscription = (unsubscribe?: () => Promise<void>) => {
    if (unsubscribe)
      void unsubscribe().catch(() => logger.warn('Account analytics unsubscribe failed'));
  };
  let loading = false;
  // Recovery events during a read or save may follow missed changes, so read once more.
  let isRereadQueued = false;
  let lastSuccessfulRefresh = 0;

  const refresh = async () => {
    const accountId = getCurrentUser()?.id ?? null;
    if (!active) return;
    if (loading || state.saving) {
      isRereadQueued = true;
      return;
    }
    const currentGeneration = generation;
    const currentRevision = revision;
    if (!accountId) return;
    loading = true;
    try {
      const optOut = await UsersService.getAnalyticsOptOut(accountId);
      if (active && generation === currentGeneration && revision === currentRevision) {
        lastSuccessfulRefresh = Date.now();
        publish({ accountId, enabled: !optOut, ready: true, saving: false, loadFailed: false });
      }
    } catch {
      if (active && generation === currentGeneration && revision === currentRevision) {
        publish({ ...state, enabled: false, ready: false, loadFailed: true });
      }
      logger.warn('Could not load account analytics preference');
    } finally {
      if (generation === currentGeneration) {
        loading = false;
        if (isRereadQueued) {
          isRereadQueued = false;
          void refresh();
        }
      }
    }
  };

  const refreshAfterSave = () => {
    if (active && isRereadQueued && !loading && !state.saving) {
      isRereadQueued = false;
      void refresh();
    }
  };
  saveSettledListeners.add(refreshAfterSave);

  const changeAccount = () => {
    const accountId = getCurrentUser()?.id ?? null;
    if (accountId === state.accountId && state.saving) return;
    generation += 1;
    const currentGeneration = generation;
    loading = false;
    isRereadQueued = false;
    stopSubscription(unsubscribeRecord);
    unsubscribeRecord = undefined;
    stopSubscription(unsubscribeConnect);
    unsubscribeConnect = undefined;
    publish({
      accountId,
      enabled: !accountId && getSignedOutAnalyticsEnabled(),
      ready: !accountId,
      saving: false,
      loadFailed: false,
    });
    if (!accountId) return;
    void refresh();
    void UsersService.subscribeAnalyticsPreference(accountId, optOut => {
      if (active && currentGeneration === generation && !state.saving) {
        revision += 1;
        publish({ accountId, enabled: !optOut, ready: true, saving: false, loadFailed: false });
      }
    })
      .then(unsubscribe => {
        if (!active || currentGeneration !== generation) stopSubscription(unsubscribe);
        else unsubscribeRecord = unsubscribe;
      })
      .catch(() => logger.warn('Account analytics subscription unavailable'));
    void UsersService.subscribeRealtimeConnect(() => {
      if (active && currentGeneration === generation) void refresh();
    })
      .then(unsubscribe => {
        if (!active || currentGeneration !== generation) stopSubscription(unsubscribe);
        else unsubscribeConnect = unsubscribe;
      })
      .catch(() => logger.warn('Account analytics reconnect subscription unavailable'));
  };

  const removeAuthListener = onAuthChange(changeAccount, true);
  const refreshIfVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  window.addEventListener('focus', refreshIfVisible);
  document.addEventListener('visibilitychange', refreshIfVisible);
  const interval = window.setInterval(() => {
    if (
      document.visibilityState === 'visible' &&
      (state.loadFailed ||
        !unsubscribeRecord ||
        Date.now() - lastSuccessfulRefresh >= HEALTHY_PREFERENCE_REFRESH_MS)
    ) {
      void refresh();
    }
  }, PREFERENCE_RETRY_TICK_MS);
  return () => {
    active = false;
    saveSettledListeners.delete(refreshAfterSave);
    generation += 1;
    removeAuthListener();
    stopSubscription(unsubscribeRecord);
    stopSubscription(unsubscribeConnect);
    window.removeEventListener('focus', refreshIfVisible);
    document.removeEventListener('visibilitychange', refreshIfVisible);
    window.clearInterval(interval);
    publish({ accountId: null, enabled: false, ready: false, saving: false, loadFailed: false });
  };
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  const accountId = getCurrentUser()?.id;
  if (!accountId || accountId !== state.accountId || !state.ready || state.saving) {
    throw new Error('Account analytics preference is not ready');
  }
  const currentGeneration = generation;
  revision += 1;
  // A pending opt-out can only reduce capture, including after sign-out.
  if (!enabled) rememberConsent(accountId, false);
  publish({ ...state, enabled: enabled ? state.enabled : false, saving: true });
  try {
    const optOut = await UsersService.updateAnalyticsOptOut(accountId, !enabled);
    if (generation === currentGeneration) {
      publish({ accountId, enabled: !optOut, ready: true, saving: false, loadFailed: false });
    }
  } catch (error) {
    if (generation !== currentGeneration) return;
    if (generation === currentGeneration) {
      publish({ ...state, enabled: false, ready: false, saving: false, loadFailed: true });
      try {
        const optOut = await UsersService.getAnalyticsOptOut(accountId);
        if (generation === currentGeneration) {
          publish({ accountId, enabled: !optOut, ready: true, saving: false, loadFailed: false });
          if (optOut === !enabled) return;
        }
      } catch {
        logger.warn('Could not confirm account analytics preference after save failure');
      }
    }
    throw error;
  } finally {
    if (generation === currentGeneration) {
      saveSettledListeners.forEach(listener => listener());
    }
  }
}

export function captureAccountAnalyticsEvent(
  event: string,
  properties: Record<string, unknown>
): void {
  const accountId = getCurrentUser()?.id;
  if (!accountId || state.accountId !== accountId) return;
  const capture = () => {
    if (getAnalyticsEnabled()) posthog.capture(event, properties);
  };
  if (state.ready) {
    capture();
    return;
  }
  const unsubscribe = subscribeAnalyticsPreference(() => {
    if (state.accountId !== accountId || state.ready) {
      unsubscribe();
      window.clearTimeout(timeout);
      if (state.accountId === accountId) capture();
    }
  });
  const timeout = window.setTimeout(unsubscribe, 15_000);
}
