import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsSource = readFileSync(
  resolve(process.cwd(), 'public/js/bootstrap-analytics.js'),
  'utf8'
);

type BootstrapAnalytics = {
  EVENT_NAME: string;
  SURFACE: string;
  REASONS: Record<string, string>;
  isAllowedReason: (reason: string) => boolean;
  isDoNotTrackEnabled: (nav?: { doNotTrack?: string }, win?: { doNotTrack?: string }) => boolean;
  readPublicConfig: (root?: { __OG_PUBLIC_ANALYTICS__?: unknown }) => {
    key: string;
    host: string;
  };
  resolveIngestBase: (host: string) => string;
  buildCapturePayload: (
    apiKey: string,
    reason: string,
    distinctId: string,
    nowIso?: string
  ) => {
    api_key: string;
    batch: Array<{
      event: string;
      properties: Record<string, string>;
      timestamp: string;
    }>;
    sent_at: string;
  };
  captureBootstrapFailureShown: (reason: string, deps?: Record<string, unknown>) => boolean;
  captureBootstrapRecovery: (reason: string, deps?: Record<string, unknown>) => boolean;
};

declare global {
  interface Window {
    __OG_BOOTSTRAP_ANALYTICS__?: BootstrapAnalytics;
  }
}

const loadAnalytics = (): BootstrapAnalytics => {
  delete window.__OG_BOOTSTRAP_ANALYTICS__;
  new Script(analyticsSource, { filename: 'bootstrap-analytics.js' }).runInThisContext();
  const api = window.__OG_BOOTSTRAP_ANALYTICS__;
  if (!api) {
    throw new Error('bootstrap-analytics did not attach window.__OG_BOOTSTRAP_ANALYTICS__');
  }
  return api;
};

describe('bootstrap-analytics beacon helper', () => {
  beforeEach(() => {
    delete window.__OG_BOOTSTRAP_ANALYTICS__;
  });

  afterEach(() => {
    delete window.__OG_BOOTSTRAP_ANALYTICS__;
    vi.restoreAllMocks();
  });

  it.each(['captureBootstrapFailureShown', 'captureBootstrapRecovery'] as const)(
    'respects browser opt-out for %s',
    method => {
      const api = loadAnalytics();
      const sendBeacon = vi.fn();
      expect(
        api[method]('startup_timeout', {
          config: { key: 'phc_test', host: '/glimmer' },
          storage: { getItem: (key: string) => (key === 'og:analytics:enabled' ? 'false' : null) },
          sendBeacon,
        })
      ).toBe(false);
      expect(sendBeacon).not.toHaveBeenCalled();
    }
  );

  it('allows only the registered low-cardinality reasons', () => {
    const api = loadAnalytics();
    expect(api.isAllowedReason('module_resource')).toBe(true);
    expect(api.isAllowedReason('startup_timeout')).toBe(true);
    expect(api.isAllowedReason('runtime_error')).toBe(true);
    expect(api.isAllowedReason('something_else')).toBe(false);
    expect(api.isAllowedReason('/assets/main.js')).toBe(false);
  });

  it('builds a payload with reason and surface only (no stacks or paths)', () => {
    const api = loadAnalytics();
    const payload = api.buildCapturePayload(
      'phc_test',
      'startup_timeout',
      'anon-1',
      '2026-01-01T00:00:00.000Z'
    );

    expect(payload.api_key).toBe('phc_test');
    expect(payload.batch).toHaveLength(1);
    expect(payload.batch[0]?.event).toBe('bootstrap_failure_shown');
    expect(payload.batch[0]?.properties).toEqual({
      token: 'phc_test',
      distinct_id: 'anon-1',
      reason: 'startup_timeout',
      surface: 'app_error',
      $lib: 'og-bootstrap-shell',
      $lib_version: '1',
    });
    expect(JSON.stringify(payload)).not.toMatch(/Error:|at |stack|\.tsx|\.js:|contact@/i);
  });

  it('respects Do Not Track and skips capture without a public key', () => {
    const api = loadAnalytics();
    const sendBeacon = vi.fn(() => true);

    expect(
      api.captureBootstrapFailureShown('runtime_error', {
        navigator: { doNotTrack: '1' },
        config: { key: 'phc_test', host: '/glimmer' },
        sendBeacon,
      })
    ).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();

    expect(
      api.captureBootstrapFailureShown('runtime_error', {
        navigator: { doNotTrack: '0' },
        config: { key: '', host: '/glimmer' },
        sendBeacon,
      })
    ).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('posts via sendBeacon to the configured ingest host', () => {
    const api = loadAnalytics();
    const sendBeacon = vi.fn(() => true);
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };

    const started = api.captureBootstrapFailureShown('module_resource', {
      navigator: { doNotTrack: '0' },
      config: { key: 'phc_test', host: '/glimmer' },
      sendBeacon,
      storage,
      nowIso: '2026-01-01T00:00:00.000Z',
    });

    expect(started).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/glimmer/e/');
    const body = sendBeacon.mock.calls[0]?.[1];
    expect(body).toBeInstanceOf(Blob);
  });

  it('falls back to keepalive fetch when sendBeacon fails', () => {
    const api = loadAnalytics();
    const sendBeacon = vi.fn(() => false);
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const storage = {
      getItem: vi.fn(() => 'existing-anon'),
      setItem: vi.fn(),
    };

    const started = api.captureBootstrapFailureShown('startup_timeout', {
      navigator: { doNotTrack: '0' },
      config: { key: 'phc_test', host: 'https://us.i.posthog.com' },
      sendBeacon,
      fetch: fetchFn,
      storage,
    });

    expect(started).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://us.i.posthog.com/e/');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
    });
    const body = String(fetchFn.mock.calls[0]?.[1]?.body ?? '');
    expect(body).toContain('"reason":"startup_timeout"');
    expect(body).toContain('"surface":"app_error"');
    expect(body).not.toContain('stack');
  });

  it('ignores unset Vite placeholder keys', () => {
    const api = loadAnalytics();
    expect(
      api.readPublicConfig({
        __OG_PUBLIC_ANALYTICS__: {
          key: '%VITE_PUBLIC_POSTHOG_KEY%',
          host: '%VITE_PUBLIC_POSTHOG_HOST%',
        },
      })
    ).toEqual({ key: '', host: '', release: undefined });
  });

  it('captures safe startup context without transmitting paths or user agents', () => {
    const api = loadAnalytics();
    const fetchFn = vi.fn((_url: string, _options: { body: string }) => Promise.resolve());
    api.captureBootstrapFailureShown('module_resource', {
      config: { key: 'phc_test', host: '/glimmer', release: 'abcdef123456' },
      navigator: {
        doNotTrack: '0',
        userAgent: 'Mozilla/5.0 Version/18.0 Mobile Safari/605.1.15',
        onLine: false,
        serviceWorker: { controller: {} },
      },
      window: { location: { pathname: '/auth/verify-email/private-token' } },
      sendBeacon: () => false,
      fetch: fetchFn,
    });
    const payload = JSON.parse(fetchFn.mock.calls[0]![1].body);
    expect(payload.batch[0].properties).toMatchObject({
      release: 'abcdef123456',
      browser_family: 'safari',
      route_category: 'auth',
      online: false,
      service_worker_controlled: true,
    });
    expect(JSON.stringify(payload)).not.toMatch(/private-token|Mozilla|Safari\/|verify-email/);
  });

  it('uses the configured preview environment', () => {
    const api = loadAnalytics();
    const fetchFn = vi.fn((_url: string, _options: { body: string }) => Promise.resolve());

    api.captureBootstrapFailureShown('module_resource', {
      config: { key: 'phc_test', host: '/glimmer', environment: 'preview' },
      navigator: { doNotTrack: '0' },
      window: { location: { hostname: 'organized-glitter-preview.view.fast', pathname: '/login' } },
      sendBeacon: () => false,
      fetch: fetchFn,
    });

    const payload = JSON.parse(fetchFn.mock.calls[0]![1].body);
    expect(payload.batch[0].properties.environment).toBe('preview');
  });

  it('contains asynchronous transport failures instead of creating another rejection', async () => {
    const api = loadAnalytics();
    const rejected = Promise.reject(new Error('offline'));
    const catchSpy = vi.spyOn(rejected, 'catch');
    api.captureBootstrapFailureShown('startup_timeout', {
      config: { key: 'phc_test', host: '/glimmer' },
      navigator: { doNotTrack: '0' },
      sendBeacon: () => false,
      fetch: () => rejected,
    });
    await rejected.catch(() => {});
    expect(catchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses the recovery event and still respects Do Not Track', () => {
    const api = loadAnalytics();
    const fetchFn = vi.fn((_url: string, _options: { body: string }) => Promise.resolve());
    const deps = {
      config: { key: 'phc_test', host: '/glimmer' },
      navigator: { doNotTrack: '0' },
      sendBeacon: () => false,
      fetch: fetchFn,
    };
    expect(api.captureBootstrapRecovery('startup_timeout', deps)).toBe(true);
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body).batch[0].event).toBe('bootstrap_recovered');
    expect(
      api.captureBootstrapRecovery('startup_timeout', {
        ...deps,
        navigator: { doNotTrack: '1' },
      })
    ).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
