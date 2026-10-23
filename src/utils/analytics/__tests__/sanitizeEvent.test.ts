import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { sanitizeAnalyticsEvent } from '../sanitizeEvent';

describe('sanitizeAnalyticsEvent', () => {
  it('removes record IDs from SDK URLs, paths and person properties', () => {
    const path = '/coloring/private-book/pages/private-page';
    const url = `https://example.test${path}?q=private-search`;
    const event: CaptureResult = {
      uuid: 'event-id',
      event: '$pageview',
      properties: {
        path,
        $current_url: url,
        $session_entry_url: url,
        $referrer: 'https://example.test/projects/private-project/edit',
        $set_once: { $initial_pathname: path },
      },
      $set: { $initial_current_url: url },
    };

    const result = sanitizeAnalyticsEvent(event);
    expect(result.properties.path).toBe('/coloring/:bookId/pages/:pageId');
    expect(result.properties.$referrer).toBe('https://example.test/projects/:id/edit');
    expect(JSON.stringify(result)).not.toMatch(/private-(book|page|project|search)/);
  });

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
});
