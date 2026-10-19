import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => {
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_disposable_capability_test');
  vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'http://127.0.0.1:9');
  return {
    user: null as { id: string; created: string } | null,
    listeners: new Set<() => void>(),
  };
});

vi.mock('@/services/auth', () => ({
  getCurrentUser: () => auth.user,
  onAuthChange: (listener: () => void) => {
    auth.listeners.add(listener);
    listener();
    return () => auth.listeners.delete(listener);
  },
}));
vi.mock('@/services/pocketbase/users.service', () => ({
  UsersService: {
    getAnalyticsOptOut: async () => false,
    subscribeAnalyticsPreference: async () => async () => {},
    subscribeRealtimeConnect: async () => async () => {},
  },
}));

afterEach(() => {
  auth.user = null;
  auth.listeners.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('keeps an unsupported real SDK transport disabled through consent publication', async () => {
  const eventRequests: string[] = [];
  class FakeXHR {
    withCredentials = true;
    readyState = 0;
    status = 200;
    responseText = '{}';
    onreadystatechange?: () => void;
    private url = '';
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader() {}
    send() {
      if (this.url.includes('/e/')) eventRequests.push(this.url);
      this.readyState = 4;
      this.onreadystatechange?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url).includes('/e/')) eventRequests.push(String(url));
    return new Response('{}', { status: 200 });
  });
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string) => {
      if (String(url).includes('/e/')) eventRequests.push(String(url));
      return true;
    },
  });

  const { default: posthog } = await import('posthog-js');
  const init = posthog.init;
  vi.spyOn(posthog, 'init').mockImplementation((...args) => {
    const client = Reflect.apply(init, posthog, args);
    const batch = Object.values(posthog).find(
      value =>
        value &&
        typeof value === 'object' &&
        typeof value.enqueue === 'function' &&
        typeof value.enable === 'function' &&
        typeof value.unload === 'function'
    ) as Record<string, unknown> | undefined;
    expect(batch).toBeDefined();
    batch!.extraQueue = [];
    return client;
  });

  const { AnalyticsProvider } = await import('../AnalyticsProvider');
  const { getAnalyticsEnabled } = await import('@/services/analytics-preference');
  const { armDeletionTransportFence, installDeletionAnalyticsFence, suspendDeletionAnalytics } =
    await import('@/services/accountDeletion/analytics');

  render(
    <AnalyticsProvider>
      <div>App</div>
    </AnalyticsProvider>
  );
  expect((posthog as unknown as { _requestQueue?: unknown })._requestQueue).toBeUndefined();
  expect(installDeletionAnalyticsFence()).toBe(false);
  const signedOutEnabled = getAnalyticsEnabled();

  auth.user = { id: 'account-a', created: '2026-01-01' };
  auth.listeners.forEach(listener => listener());
  const { getAnalyticsPreference } = await import('@/services/analytics-preference');
  await waitFor(() =>
    expect(getAnalyticsPreference()).toMatchObject({ accountId: 'account-a', ready: true })
  );
  const signedInEnabled = getAnalyticsEnabled();
  const optedOutAfterPublication = posthog.has_opted_out_capturing();

  eventRequests.length = 0;
  posthog.set_config({ opt_out_useragent_filter: true });
  expect(posthog.capture('session_context', { fixture: 'rejected-capability' })).toBeUndefined();
  armDeletionTransportFence('http://localhost:8090', 'account-a');
  suspendDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(eventRequests).toEqual([]);
  expect(signedOutEnabled).toBe(false);
  expect(signedInEnabled).toBe(false);
  expect(optedOutAfterPublication).toBe(true);
});
