import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import posthog from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAnalyticsEnabled } from '@/services/analytics-preference';

const { auth, authListeners } = vi.hoisted(() => {
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_synthetic_analytics_test');
  vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://example.test/glimmer');
  return {
    authListeners: new Set<() => void>(),
    auth: {
      user: null as { id: string; created: string; analytics_opt_out?: boolean } | null,
      isAuthenticated: false,
      initialCheckComplete: false,
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

vi.mock('@/services/auth', () => ({
  getCurrentUser: () => auth.user,
  onAuthChange: (callback: () => void) => {
    authListeners.add(callback);
    callback();
    return () => authListeners.delete(callback);
  },
}));
vi.mock('@/services/pocketbase/users.service', () => ({
  UsersService: {
    getAnalyticsOptOut: async () => auth.user?.analytics_opt_out ?? false,
    updateAnalyticsOptOut: async (_id: string, optOut: boolean) => optOut,
    subscribeAnalyticsPreference: async () => async () => {},
    subscribeRealtimeConnect: async () => async () => {},
  },
}));
async function settlePreference() {
  await act(async () => {
    authListeners.forEach(callback => callback());
    await Promise.resolve();
  });
}

import { AnalyticsProvider } from '../AnalyticsProvider';

describe('AnalyticsProvider lifecycle with the real SDK', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    auth.user = null;
    auth.isAuthenticated = false;
    auth.initialCheckComplete = false;
  });

  afterEach(() => {
    posthog.opt_out_capturing();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('strips the document title from real SDK pageviews and drops unregistered events', async () => {
    auth.initialCheckComplete = true;
    const previousTitle = document.title;
    document.title = 'My Secret Project | Organized Glitter';
    const capture = vi.spyOn(posthog, 'capture');
    try {
      render(
        <MemoryRouter>
          <AnalyticsProvider>
            <div />
          </AnalyticsProvider>
        </MemoryRouter>
      );
      await settlePreference();
      const index = capture.mock.calls.findIndex(([name]) => name === '$pageview');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(capture.mock.results[index].value).toBeDefined();
      expect(JSON.stringify(capture.mock.results[index].value)).not.toContain('My Secret Project');
      expect(posthog.capture('unregistered_event')).toBeUndefined();
    } finally {
      document.title = previousTitle;
    }
  });

  it.each([true, false])(
    'keeps the confirmed opt-out %s after sign-out with the real SDK',
    async optOut => {
      auth.initialCheckComplete = true;
      auth.isAuthenticated = true;
      auth.user = { id: 'consent-account', created: '2026-01-01', analytics_opt_out: optOut };
      const capture = vi.spyOn(posthog, 'capture');
      render(
        <MemoryRouter>
          <AnalyticsProvider>
            <div />
          </AnalyticsProvider>
        </MemoryRouter>
      );
      await settlePreference();
      if (!optOut) {
        const index = capture.mock.calls.findIndex(([name]) => name === '$identify');
        expect(index).toBeGreaterThanOrEqual(0);
        expect(capture.mock.results[index].value?.event).toBe('$identify');
      }
      auth.user = null;
      auth.isAuthenticated = false;
      await settlePreference();
      expect(posthog.has_opted_out_capturing()).toBe(optOut);
      if (optOut) expect(posthog.capture('project_created')).toBeUndefined();
      else expect(posthog.capture('project_created')).toBeDefined();
    }
  );

  it('does not capture campaign text, including properties saved by the old SDK settings', async () => {
    render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    await settlePreference();
    expect(posthog.config.save_campaign_params).toBe(false);
    posthog.register({
      utm_content: 'private-campaign-text',
      $initial_utm_term: 'private-search-term',
    });
    const event = posthog.capture('session_context');
    expect(event).toBeDefined();
    expect(JSON.stringify(event)).not.toContain('private-campaign-text');
    expect(JSON.stringify(event)).not.toContain('private-search-term');
  });

  it('blocks captures and account switches while off, then identifies the current account when enabled', async () => {
    auth.initialCheckComplete = true;
    auth.isAuthenticated = true;
    auth.user = { id: 'off-account', created: '2026-01-01', analytics_opt_out: true };
    const identify = vi.spyOn(posthog, 'identify');
    const reset = vi.spyOn(posthog, 'reset');
    const tree = () => (
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    const view = render(tree());
    await settlePreference();
    expect(posthog.capture('project_created')).toBeUndefined();
    auth.user = { id: 'current-account', created: '2026-01-01', analytics_opt_out: true };
    view.rerender(tree());
    await settlePreference();
    expect(reset).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
    expect(posthog.has_opted_out_capturing()).toBe(true);
    await act(async () => {
      await setAnalyticsEnabled(true);
    });
    expect(posthog.get_distinct_id()).toBe('current-account');
    expect(posthog.capture('project_created')).toBeDefined();
  });

  it('preserves DNT and disabled replay/autocapture', async () => {
    render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    await settlePreference();
    expect(posthog.config.respect_dnt).toBe(true);
    expect(posthog.config.disable_session_recording).toBe(true);
    expect(posthog.config.autocapture).toBe(false);
    expect(posthog.config).toMatchObject({
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_performance: false,
      rageclick: false,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      advanced_disable_feature_flags: true,
      disable_surveys: true,
      capture_exceptions: false,
      mask_all_element_attributes: true,
      mask_all_text: true,
      mask_personal_data_properties: true,
    });
    expect(posthog.config.capture_webmcp).toBeFalsy();
    expect(posthog.config.logs?.captureConsoleLogs).toBeFalsy();
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });
    try {
      expect(posthog.capture('project_created')).toBeUndefined();
    } finally {
      Reflect.deleteProperty(navigator, 'doNotTrack');
    }
  });

  it('resets a stale account before identifying a different restored account', async () => {
    const first = render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    await settlePreference();
    first.unmount();
    posthog.reset();
    posthog.opt_in_capturing({ captureEventName: false });
    posthog.identify('previous-account');
    const reset = vi.spyOn(posthog, 'reset');
    const identify = vi.spyOn(posthog, 'identify');
    auth.user = { id: 'restored-account', created: '2026-01-01' };
    auth.isAuthenticated = true;
    auth.initialCheckComplete = true;
    render(
      <StrictMode>
        <MemoryRouter>
          <AnalyticsProvider>
            <div />
          </AnalyticsProvider>
        </MemoryRouter>
      </StrictMode>
    );
    await settlePreference();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(identify).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(identify.mock.invocationCallOrder[0]);
    expect(posthog.get_distinct_id()).toBe('restored-account');
  });
  it('resets identified identity on opted-out sign-out, then restores opt-out', async () => {
    auth.initialCheckComplete = true;
    auth.isAuthenticated = true;
    auth.user = { id: 'reset-account', created: '2026-01-01' };
    render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    await settlePreference();
    expect(posthog.get_property('$user_id')).toBe('reset-account');
    const reset = vi.spyOn(posthog, 'reset');
    const optOut = vi.spyOn(posthog, 'opt_out_capturing');
    await act(async () => {
      await setAnalyticsEnabled(false);
    });
    expect(reset).not.toHaveBeenCalled();
    expect(posthog.get_distinct_id()).toBe('reset-account');
    optOut.mockClear();
    auth.user = null;
    auth.isAuthenticated = false;
    await settlePreference();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(optOut.mock.invocationCallOrder[0]);
    expect(posthog.get_property('$user_id')).toBeUndefined();
    expect(posthog.get_distinct_id()).not.toBe('reset-account');
    expect(posthog.has_opted_out_capturing()).toBe(true);
    const persisted = JSON.parse(localStorage.getItem('ph_phc_synthetic_analytics_test_posthog')!);
    expect(persisted.$user_id).toBeUndefined();
    expect(persisted.distinct_id).not.toBe('reset-account');
  });
});
