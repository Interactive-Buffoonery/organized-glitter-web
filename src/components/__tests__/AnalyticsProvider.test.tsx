import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => {
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_synthetic_analytics_test');
  vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://example.test/glimmer');
  return {
    auth: {
      user: null as { id: string; created: string } | null,
      isAuthenticated: false,
      initialCheckComplete: false,
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

import { setAnalyticsEnabled } from '@/services/analytics-preference';

import { AnalyticsProvider } from '../AnalyticsProvider';

describe('AnalyticsProvider lifecycle with the real SDK', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    auth.user = null;
    auth.isAuthenticated = false;
    auth.initialCheckComplete = false;
    setAnalyticsEnabled(true);
    posthog.opt_in_capturing();
  });

  afterEach(() => {
    posthog.opt_out_capturing();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('waits for auth restoration, then captures startup events once with the account identity', () => {
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

  it('does not capture campaign text, including properties saved by the old SDK settings', () => {
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

  it('blocks captures and account switches while off, then identifies the current account when enabled', () => {
    setAnalyticsEnabled(false);
    auth.initialCheckComplete = true;
    auth.isAuthenticated = true;
    auth.user = { id: 'off-account', created: '2026-01-01' };
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
    expect(posthog.capture('project_created')).toBeUndefined();
    auth.user = { id: 'current-account', created: '2026-01-01' };
    view.rerender(tree());
    expect(reset).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
    expect(posthog.has_opted_out_capturing()).toBe(true);
    act(() => setAnalyticsEnabled(true));
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

  it('resets a stale account before identifying a different restored account', () => {
    posthog.reset();
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
    expect(reset).toHaveBeenCalledTimes(1);
    expect(identify).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(identify.mock.invocationCallOrder[0]);
    expect(posthog.get_distinct_id()).toBe('restored-account');
  });
});
