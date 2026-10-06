import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  },
}));
import { captureAccountAnalyticsEvent, setAnalyticsEnabled } from '@/services/analytics-preference';
async function settlePreference() {
  await act(async () => {
    authListeners.forEach(callback => callback());
    await Promise.resolve();
  });
}

import { AnalyticsProvider } from '../AnalyticsProvider';

describe('AnalyticsProvider lifecycle with the real SDK', () => {
  beforeEach(() => {
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

  it('waits for auth restoration, then captures startup events once with the account identity', async () => {
    const capture = vi.spyOn(posthog, 'capture');
    const reset = vi.spyOn(posthog, 'reset');
    const tree = () => (
      <StrictMode>
        <MemoryRouter initialEntries={['/projects/private-project']}>
          <AnalyticsProvider>
            <div>Product content</div>
          </AnalyticsProvider>
        </MemoryRouter>
      </StrictMode>
    );
    const view = render(tree());
    expect(view.getByText('Product content')).toBeInTheDocument();
    expect(capture).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();

    auth.user = { id: 'account-a', created: '2026-01-01' };
    auth.isAuthenticated = true;
    auth.initialCheckComplete = true;
    view.rerender(tree());
    await settlePreference();

    for (const event of ['session_context', '$pageview']) {
      const calls = capture.mock.calls.flatMap(([name], index) =>
        name === event ? [capture.mock.results[index].value] : []
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]?.properties.distinct_id).toBe('account-a');
    }
    expect(capture).toHaveBeenCalledWith('$pageview', {
      $current_url: `${window.location.origin}/projects/:id`,
      path: '/projects/:id',
    });
  });

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

  it('captures a fresh signed-out startup after SDK initialization', () => {
    auth.initialCheckComplete = true;
    const capture = vi.spyOn(posthog, 'capture');
    render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    const index = capture.mock.calls.findIndex(([event]) => event === '$pageview');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(capture.mock.results[index].value).toBeDefined();
  });

  it('counts navigation between records even though their route template is the same', () => {
    auth.initialCheckComplete = true;
    const capture = vi.spyOn(posthog, 'capture');
    let navigate: ReturnType<typeof useNavigate>;
    function Navigation() {
      navigate = useNavigate();
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/projects/first-private-record']}>
        <AnalyticsProvider>
          <Navigation />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    act(() => navigate('/projects/second-private-record'));
    const pageviews = capture.mock.calls.filter(([event]) => event === '$pageview');
    expect(pageviews).toHaveLength(2);
    expect(pageviews.every(([, properties]) => properties?.path === '/projects/:id')).toBe(true);
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

  it('preserves anonymous identity across provider remounts', () => {
    posthog.reset();
    auth.initialCheckComplete = true;
    const tree = (
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    const first = render(tree);
    const anonymousId = posthog.get_distinct_id();
    first.unmount();
    render(tree);
    expect(posthog.get_distinct_id()).toBe(anonymousId);
  });

  it('sets account identity before an immediate direct capture', async () => {
    auth.user = { id: 'account-b', created: '2026-01-01' };
    auth.isAuthenticated = true;
    auth.initialCheckComplete = true;
    const view = render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    await settlePreference();
    const event = posthog.capture('project_created');
    expect(event?.properties.distinct_id).toBe('account-b');
    view.unmount();
  });

  it('defers a sign-in success until account consent and identity are ready', async () => {
    auth.user = { id: 'just-signed-in', created: '2026-01-01' };
    auth.isAuthenticated = true;
    auth.initialCheckComplete = true;
    const capture = vi.spyOn(posthog, 'capture');
    render(
      <MemoryRouter>
        <AnalyticsProvider>
          <div />
        </AnalyticsProvider>
      </MemoryRouter>
    );
    captureAccountAnalyticsEvent('auth_login_succeeded', { auth_method: 'password' });
    expect(capture.mock.calls.filter(([event]) => event === 'auth_login_succeeded')).toHaveLength(
      0
    );
    await settlePreference();
    const index = capture.mock.calls.findIndex(([event]) => event === 'auth_login_succeeded');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(capture.mock.results[index].value?.properties.distinct_id).toBe('just-signed-in');
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
    posthog.reset();
    posthog.opt_in_capturing({ captureEventName: false });
    posthog.identify('previous-account');
    first.unmount();
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
});
