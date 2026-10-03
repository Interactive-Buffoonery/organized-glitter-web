import type { CaptureResult } from 'posthog-js';
import { sanitizeSensitivePath } from '@/utils/auth/sensitivePath';

function sanitizeProperty(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        return `${url.origin}${sanitizeSensitivePath(url.pathname)}`;
      } catch {
        return '[redacted]';
      }
    }
    return value.startsWith('/') ? sanitizeSensitivePath(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeProperty);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, property]) => [key, sanitizeProperty(property)])
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
