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
import { inspectException, safeException } from '@/utils/error/safeException';

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
 * Fire-and-forget exception capture.
 * Uses PostHog's structured exception API so stack frames, message, and type are included.
 *
 * Enrichment happens here, the single chokepoint:
 *  - inputs are replaced with bounded, redacted Errors
 *  - the error is classified as likely-external (extension/cross-origin) noise
 *  - caller `properties` are merged LAST so an explicit `$exception_source`,
 *    `route`, etc. from the call site always win.
 */
export function captureException(error: unknown, properties?: Record<string, unknown>): void {
  const normalized = safeException(error);
  const classification = classifyExternalError(inspectException(error));

  const mergedProps: Record<string, unknown> = {
    ...classification,
    ...normalized.properties,
    ...properties,
  };

  posthog.captureException(normalized.error, mergedProps);
}
