/**
 * Pre-React PostHog capture for bootstrap failures.
 * AnalyticsProvider never mounts when boot dies, so this shell path uses
 * sendBeacon (fetch keepalive fallback) with low-cardinality properties only.
 *
 * Config comes from window.__OG_PUBLIC_ANALYTICS__ injected at HTML build time
 * (see vite.config.ts transformIndexHtml). Public key only; no secrets.
 */
(function (global) {
  'use strict';

  var EVENT_NAME = 'bootstrap_failure_shown';
  var RECOVERY_EVENT_NAME = 'bootstrap_recovered';
  var SURFACE = 'app_error';
  var ANON_STORAGE_KEY = 'og_bootstrap_anon_id';
  var startedAt = Date.now();

  var REASONS = {
    module_resource: 'module_resource',
    startup_timeout: 'startup_timeout',
    runtime_error: 'runtime_error',
  };

  function isAllowedReason(reason) {
    return (
      reason === REASONS.module_resource ||
      reason === REASONS.startup_timeout ||
      reason === REASONS.runtime_error
    );
  }

  function isDoNotTrackEnabled(nav, win) {
    var navigatorRef = nav || (typeof navigator !== 'undefined' ? navigator : null);
    var windowRef = win || (typeof window !== 'undefined' ? window : null);
    if (!navigatorRef && !windowRef) return false;
    var dnt =
      (navigatorRef && navigatorRef.doNotTrack) ||
      (windowRef && windowRef.doNotTrack) ||
      (navigatorRef && navigatorRef.msDoNotTrack);
    return dnt === '1' || dnt === 'yes';
  }

  function readPublicConfig(root) {
    var scope = root || global;
    var raw = scope && scope.__OG_PUBLIC_ANALYTICS__;
    if (!raw || typeof raw !== 'object') {
      return { key: '', host: '' };
    }
    var key = typeof raw.key === 'string' ? raw.key.trim() : '';
    var host = typeof raw.host === 'string' ? raw.host.trim() : '';
    // Vite may leave an unreplaced placeholder if env is missing at build time.
    if (key.indexOf('%VITE_') === 0 || key === 'undefined') key = '';
    if (host.indexOf('%VITE_') === 0 || host === 'undefined') host = '';
    return { key: key, host: host, release: raw.release, environment: raw.environment };
  }

  function resolveIngestBase(host) {
    if (host) return host.replace(/\/$/, '');
    return '/glimmer';
  }

  function createAnonId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (_) {
      /* fall through */
    }
    return 'og_' + String(Date.now()) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function resolveDistinctId(storage, apiKey) {
    var store = storage;
    if (!store) {
      try {
        store = typeof localStorage !== 'undefined' ? localStorage : null;
      } catch (_) {
        store = null;
      }
    }
    if (!store) return createAnonId();

    if (apiKey) {
      try {
        var phRaw = store.getItem('ph_' + apiKey + '_posthog');
        if (phRaw) {
          var parsed = JSON.parse(phRaw);
          if (parsed && typeof parsed.distinct_id === 'string' && parsed.distinct_id) {
            return parsed.distinct_id;
          }
        }
      } catch (_) {
        /* ignore corrupt SDK state */
      }
    }

    try {
      var existing = store.getItem(ANON_STORAGE_KEY);
      if (existing && typeof existing === 'string') return existing;
      var next = createAnonId();
      store.setItem(ANON_STORAGE_KEY, next);
      return next;
    } catch (_) {
      return createAnonId();
    }
  }

  function buildCapturePayload(apiKey, reason, distinctId, nowIso, context, eventName) {
    var timestamp = nowIso || new Date().toISOString();
    return {
      api_key: apiKey,
      batch: [
        {
          event: eventName || EVENT_NAME,
          properties: {
            token: apiKey,
            distinct_id: distinctId,
            reason: reason,
            surface: SURFACE,
            $lib: 'og-bootstrap-shell',
            $lib_version: '1',
            ...context,
          },
          timestamp: timestamp,
        },
      ],
      sent_at: timestamp,
    };
  }

  function readContext(options, config) {
    var nav = options.navigator || global.navigator || {};
    var win = options.window || global;
    var agent = typeof nav.userAgent === 'string' ? nav.userAgent : '';
    var browser = /Edg(?:A|iOS)?\//.test(agent)
      ? 'edge'
      : /Firefox\/|FxiOS\//.test(agent)
        ? 'firefox'
        : /Chrome\/|CriOS\//.test(agent)
          ? 'chrome'
          : /Safari\//.test(agent)
            ? 'safari'
            : 'unknown';
    var path = win.location && win.location.pathname;
    var hostname = win.location && win.location.hostname;
    var environment =
      ['localhost', '127.0.0.1', '[::1]'].indexOf(hostname) !== -1
        ? 'local'
        : config.environment || 'production';
    var segment = typeof path === 'string' ? path.split('/')[1] : '';
    var routes = [
      'login',
      'register',
      'auth',
      'dashboard',
      'overview',
      'projects',
      'coloring',
      'profile',
      'about',
    ];
    var release =
      typeof config.release === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(config.release)
        ? config.release
        : 'unknown';
    return {
      release: release,
      environment: environment,
      browser_family: browser,
      route_category: path === '/' ? 'home' : routes.indexOf(segment) !== -1 ? segment : 'other',
      online: typeof nav.onLine === 'boolean' ? nav.onLine : null,
      service_worker_controlled: Boolean(nav.serviceWorker && nav.serviceWorker.controller),
      automation: nav.webdriver === true,
      elapsed_ms: Math.max(0, Date.now() - startedAt),
    };
  }

  /**
   * @returns {boolean} true when a capture attempt was started
   */
  function captureBootstrapEvent(eventName, reason, deps) {
    var options = deps || {};
    if (!isAllowedReason(reason)) return false;
    if (isDoNotTrackEnabled(options.navigator, options.window)) return false;

    var config = options.config || readPublicConfig(options.root || global);
    if (!config.key || !config.host) return false;

    var ingestBase = resolveIngestBase(config.host);
    var url = ingestBase + '/e/';
    var distinctId = resolveDistinctId(options.storage, config.key);
    var body = JSON.stringify(
      buildCapturePayload(
        config.key,
        reason,
        distinctId,
        options.nowIso,
        readContext(options, config),
        eventName
      )
    );

    var beacon = options.sendBeacon;
    if (!beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      beacon = navigator.sendBeacon.bind(navigator);
    }

    try {
      if (typeof beacon === 'function') {
        var blob =
          typeof Blob !== 'undefined' ? new Blob([body], { type: 'application/json' }) : body;
        if (beacon(url, blob)) return true;
      }
    } catch (_) {
      /* fall through to fetch */
    }

    var fetchFn = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return false;

    try {
      Promise.resolve(
        fetchFn(url, {
          method: 'POST',
          body: body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          mode: 'cors',
          credentials: 'omit',
        })
      ).catch(function () {});
      return true;
    } catch (_) {
      return false;
    }
  }

  function captureBootstrapFailureShown(reason, deps) {
    return captureBootstrapEvent(EVENT_NAME, reason, deps);
  }

  function captureBootstrapRecovery(reason, deps) {
    return captureBootstrapEvent(RECOVERY_EVENT_NAME, reason, deps);
  }

  var api = {
    EVENT_NAME: EVENT_NAME,
    SURFACE: SURFACE,
    REASONS: REASONS,
    isAllowedReason: isAllowedReason,
    isDoNotTrackEnabled: isDoNotTrackEnabled,
    readPublicConfig: readPublicConfig,
    resolveIngestBase: resolveIngestBase,
    buildCapturePayload: buildCapturePayload,
    captureBootstrapFailureShown: captureBootstrapFailureShown,
    captureBootstrapRecovery: captureBootstrapRecovery,
  };

  global.__OG_BOOTSTRAP_ANALYTICS__ = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
