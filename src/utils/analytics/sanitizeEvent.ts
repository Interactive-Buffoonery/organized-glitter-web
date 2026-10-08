import type { CaptureResult } from 'posthog-js';
import { sanitizeAnalyticsPath } from './sanitizePath';

function sanitizeProperty(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        return `${url.origin}${sanitizeAnalyticsPath(url.pathname)}`;
      } catch {
        return '[redacted]';
      }
    }
    return value.startsWith('/') ? sanitizeAnalyticsPath(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeProperty);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^(?:\$initial_)?utm_/i.test(key))
        .map(([key, property]) => [key, sanitizeProperty(property)])
    );
  }
  return value;
}

export function sanitizeAnalyticsEvent(event: CaptureResult): CaptureResult {
  return {
    ...event,
    properties: sanitizeProperty(event.properties) as CaptureResult['properties'],
    ...(event.$set && { $set: sanitizeProperty(event.$set) as CaptureResult['properties'] }),
    ...(event.$set_once && {
      $set_once: sanitizeProperty(event.$set_once) as CaptureResult['properties'],
    }),
  };
}
