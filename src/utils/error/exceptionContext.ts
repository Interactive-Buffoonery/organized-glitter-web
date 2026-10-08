import { sanitizeAnalyticsPath } from '@/utils/analytics/sanitizePath';

/**
 * Diagnostic context for captured exceptions.
 *
 * Intentionally React-free, router-free, and app-state-free so it is safe to
 * call at bootstrap (before React/router/auth exist) AND after mount. Every
 * read is defensive: a missing global or a thrown getter must never turn a
 * crash report into a second crash.
 */

/**
 * Module-level flag toggled once React has mounted (see `markAppMounted`).
 * Used to annotate exceptions with whether they happened during startup vs.
 * after the app was live. Kept here (not in app state) so this module stays
 * dependency-light.
 */
let appInitialized = false;

/**
 * Mark the app as mounted/live. Called from `main.tsx` once React is rendered.
 */
export const markAppMounted = (): void => {
  appInitialized = true;
};

/**
 * Whether the app has reported itself mounted. Exposed for the global error
 * handler so it can decide whether an uncaught error is a startup failure.
 */
export const isAppMounted = (): boolean => appInitialized;

const MAX_COMPONENT_STACK = 4000;

/**
 * Build a safe diagnostic property bag for a captured exception.
 *
 * Wrapped entirely in try/catch: on any failure it returns whatever was
 * gathered so far (possibly `{}`). It never throws. `extra` is merged LAST so
 * caller-provided properties (e.g. `route`, an overriding `$exception_source`)
 * always win over the defaults computed here.
 */
export const buildExceptionContext = (
  source: string,
  extra?: Record<string, unknown>
): Record<string, unknown> => {
  const context: Record<string, unknown> = {};

  try {
    context.$exception_source = source;

    if (typeof window !== 'undefined' && window.location) {
      // Path and host only. Sensitive path segments are redacted as well.
      context.route = sanitizeAnalyticsPath(window.location.pathname);
      context.host = window.location.host;
    }

    if (typeof __APP_BUILD_ID__ !== 'undefined') {
      context.release = __APP_BUILD_ID__;
    }

    if (typeof navigator !== 'undefined') {
      if (navigator.userAgent) context.user_agent = navigator.userAgent;
      if (navigator.language) context.language = navigator.language;
    }

    context.app_initialized = appInitialized;
  } catch {
    // Diagnostics are best-effort; never let context-building mask the real error.
  }

  if (extra) {
    // Caller props win: merge them last so an explicit `route` /
    // `$exception_source` from the call site overrides the defaults above.
    return { ...context, ...extra };
  }

  return context;
};

/**
 * Truncate a component stack defensively so an enormous tree cannot bloat the
 * captured event. Component names are non-sensitive, so the content itself is
 * safe to include.
 */
export const truncateComponentStack = (
  componentStack: string | null | undefined
): string | undefined => {
  if (!componentStack) return undefined;
  if (componentStack.length <= MAX_COMPONENT_STACK) return componentStack;
  return `${componentStack.slice(0, MAX_COMPONENT_STACK)}\n[truncated]`;
};

interface ClassificationResult {
  suspected_external_script: boolean;
  error_origin?: 'browser_extension_or_external';
}

const EXTERNAL: ClassificationResult = {
  suspected_external_script: true,
  error_origin: 'browser_extension_or_external',
};

const NOT_EXTERNAL: ClassificationResult = { suspected_external_script: false };

/**
 * Classify whether an error most likely originates OUTSIDE our application code
 * (a browser extension or a cross-origin third-party script). This NEVER drops
 * the event; it only tags it so triage can separate "needs an app fix" from
 * "noise from a user's broken extension."
 *
 * The patterns are narrow and intentional:
 */
export const classifyExternalError = (error: unknown): ClassificationResult => {
  try {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const stack = error instanceof Error && error.stack ? error.stack : '';

    // Extension-injected scripts run from these privileged schemes. If a frame
    // in the stack lives there, the throwing code is not ours.
    if (
      stack.includes('chrome-extension://') ||
      stack.includes('moz-extension://') ||
      stack.includes('safari-extension://') ||
      stack.includes('safari-web-extension://')
    ) {
      return EXTERNAL;
    }

    // `runtime.sendMessage(). Tab not found` is thrown by extension messaging
    // (chrome.runtime / browser.runtime) when an extension's tab/port is gone.
    // It has nothing to do with our code. Match as a substring: the real
    // production string is `Unchecked runtime.lastError: ... runtime.sendMessage(). Tab not found`.
    if (message.includes('runtime.sendMessage') || message.includes('Tab not found')) {
      return EXTERNAL;
    }

    // Browsers mask cross-origin script errors as the literal `Script error.`
    // with no usable stack (CORS). When that happens, `window.onerror` has no
    // `event.error`, and our handler reconstructs a message like
    // `Script error. at :0:0`. Match by prefix (NOT exact equality) so the
    // reconstructed variant is still classified as external.
    if (message.startsWith('Script error.')) {
      return EXTERNAL;
    }

    return NOT_EXTERNAL;
  } catch {
    // If inspection itself fails, treat as not-external so a genuine app error
    // is never accidentally downgraded to noise.
    return NOT_EXTERNAL;
  }
};
