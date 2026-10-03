import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { sanitizeAnalyticsEvent } from '../sanitizeEvent';

describe('sanitizeAnalyticsEvent', () => {
  it.each(['confirm-password-reset', 'verify-email', 'confirm-email-change'])(
    'removes bearer tokens from the complete %s payload',
    route => {
      const token = 'synthetic-auth-token-123';
      const path = `/auth/${route}/${token}`;
      const url = `https://example.test${path}?token=${token}#${token}`;
      const event: CaptureResult = {
        uuid: 'event-id',
        event: '$pageview',
        properties: {
          $pathname: path,
          $current_url: url,
          $session_entry_url: url,
          $session_entry_pathname: `${path}/`,
          $referrer: url,
          $set: { $initial_current_url: url },
          $set_once: { $initial_pathname: path },
        },
        $set: { $initial_current_url: url },
        $set_once: { nested: [{ $initial_pathname: path }] },
      };

      const result = sanitizeAnalyticsEvent(event);
      expect(JSON.stringify(result)).not.toContain(token);
      expect(result.properties.$pathname).toBe(`/auth/${route}/[redacted]`);
      expect(result.properties.$current_url).toBe(`https://example.test/auth/${route}/[redacted]`);
      expect(event.properties.$pathname).toBe(path);
    }
  );

  it('preserves ordinary properties and event metadata', () => {
    const timestamp = new Date('2026-10-03T00:00:00Z');
    const event: CaptureResult = {
      uuid: 'event-id',
      event: 'session_context',
      timestamp,
      properties: {
        path: '/dashboard?search=private#section',
        count: 2,
        enabled: true,
        label: 'web',
      },
    };
    expect(sanitizeAnalyticsEvent(event)).toEqual({
      ...event,
      properties: { ...event.properties, path: '/dashboard' },
    });
  });
});
