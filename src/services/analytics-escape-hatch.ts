/**
 * Escape-hatch for capturing PostHog events outside the React tree.
 *
 * Use this ONLY from:
 *  - Class-based error boundaries (componentDidCatch)
 *  - Global window error / unhandledrejection handlers
 *  - Other non-hook code that cannot call usePostHog()
 *
 * For anything inside a functional component, prefer `usePostHog()` from
 * `@posthog/react` instead.
 */

import posthog from 'posthog-js';
import type { AnalyticsEvent } from '@/services/analytics-events';
import { classifyExternalError } from '@/utils/error/exceptionContext';

type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

/**
 * Fire-and-forget event capture.
 * Safe to call before initialization, but the SDK drops those events.
 * Lifecycle captures must wait for the provider to be ready.
 */
export function capture(event: AnalyticsEventName, properties?: Record<string, unknown>): void {
  posthog.capture(event, properties);
}

/**
 * Coerce arbitrary thrown values into a real Error so PostHog records a typed
 * exception with a message instead of `None`. Existing Errors pass through
 * untouched (preserving their stack); strings are wrapped as-is because the
 * string is the thrown message. Other values get a generic message only so
 * arbitrary object payloads are never serialized into PostHog.
 */
function normalizeError(error: unknown): { error: Error; properties?: Record<string, unknown> } {
  if (error instanceof Error) return { error };

  const nonErrorType = error === null ? 'null' : Array.isArray(error) ? 'array' : typeof error;

  if (typeof error === 'string') {
    return {
      error: new Error(error),
      properties: { non_error_type: nonErrorType },
    };
  }

  const properties: Record<string, unknown> = { non_error_type: nonErrorType };

  if (error && typeof error === 'object') {
    try {
      properties.non_error_keys = Object.keys(error as Record<string, unknown>).slice(0, 10);
    } catch {
      // Best-effort context only; never serialize object values.
    }
  }

  return {
    error: new Error(`Non-Error thrown (${nonErrorType})`),
    properties,
  };
}

/**
 * Fire-and-forget exception capture.
 * Uses PostHog's structured exception API so stack frames, message, and type are included.
 *
 * Enrichment happens here, the single chokepoint:
 *  - non-Error inputs are normalized to a real Error
 *  - the error is classified as likely-external (extension/cross-origin) noise
 *  - caller `properties` are merged LAST so an explicit `$exception_source`,
 *    `route`, etc. from the call site always win.
 */
export function captureException(error: unknown, properties?: Record<string, unknown>): void {
  const normalized = normalizeError(error);
  const classification = classifyExternalError(error);

  const mergedProps: Record<string, unknown> = {
    ...classification,
    ...normalized.properties,
    ...properties,
  };

  posthog.captureException(normalized.error, mergedProps);
}
