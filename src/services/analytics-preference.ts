import posthog from 'posthog-js';

export const ANALYTICS_PREFERENCE_KEY = 'og:analytics:enabled';
const listeners = new Set<() => void>();
let sessionPreference = true;
let sessionOverride: boolean | undefined;

export function getAnalyticsEnabled(): boolean {
  if (sessionOverride !== undefined) return sessionOverride;
  try {
    const saved = window.localStorage.getItem(ANALYTICS_PREFERENCE_KEY);
    sessionPreference = saved !== 'false';
  } catch {
    // Retain the session choice when browser storage is unavailable.
  }
  return sessionPreference;
}

export function syncAnalyticsConsent(): void {
  if (!posthog.config.token) return;
  if (getAnalyticsEnabled()) {
    posthog.opt_in_capturing({ captureEventName: false });
  } else {
    posthog.opt_out_capturing();
  }
}

function notifySubscribers(): void {
  syncAnalyticsConsent();
  listeners.forEach(listener => listener());
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== ANALYTICS_PREFERENCE_KEY && event.key !== null) return;
  sessionOverride = undefined;
  sessionPreference = event.newValue !== 'false';
  notifySubscribers();
}

export function subscribeAnalyticsPreference(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', handleStorage);
  };
}

export function setAnalyticsEnabled(enabled: boolean): void {
  sessionPreference = enabled;
  try {
    window.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, String(enabled));
    sessionOverride = undefined;
  } catch {
    sessionOverride = enabled;
  }
  notifySubscribers();
}
