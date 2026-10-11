import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { AnalyticsEvent } from '@/services/analytics-events';
import { buildWebAnalyticsContext, enrichWebAnalyticsEvent } from '../webContext';

// Isolated checks cover invalid build metadata, missing preview configuration,
// SDK super-property overrides, and accidental enrichment of diagnostic events.
describe('web analytics context', () => {
  it.each(['production', 'preview', 'local', 'other'])(
    'accepts only the explicit deployment environment %s',
    environment => {
      expect(buildWebAnalyticsContext('a'.repeat(40), environment, false)).toEqual({
        platform: 'web',
        environment,
        release: 'a'.repeat(40),
      });
    }
  );

  it.each([undefined, '', 'staging', 'Production', 'production ', 'https://private.test'])(
    'does not label a build with missing or invalid environment as production: %s',
    environment => {
      expect(buildWebAnalyticsContext('v1.2.3', environment, false).environment).toBe('other');
    }
  );

  it('uses local only for an unconfigured development server', () => {
    expect(buildWebAnalyticsContext(undefined, undefined, true)).toEqual({
      platform: 'web',
      environment: 'local',
    });
    expect(buildWebAnalyticsContext(undefined, 'invalid', true).environment).toBe('other');
    expect(buildWebAnalyticsContext('v1', 'preview', true).environment).toBe('preview');
  });

  it.each([
    undefined,
    '',
    'dev-build',
    'local-build',
    'x'.repeat(81),
    'user@example.test',
    '/private/path',
    'v1\n',
    { token: 'synthetic-secret' },
  ])('omits absent, placeholder, or unsafe release values: %s', release => {
    expect(buildWebAnalyticsContext(release, 'preview', false)).toEqual({
      platform: 'web',
      environment: 'preview',
    });
  });

  it('accepts a bounded public release label', () => {
    expect(buildWebAnalyticsContext('v1.2.3-rc_1', 'preview', false).release).toBe('v1.2.3-rc_1');
    expect(buildWebAnalyticsContext('x'.repeat(80), 'preview', false).release).toHaveLength(80);
  });

  it.each(Object.values(AnalyticsEvent).filter(name => !name.startsWith('bootstrap_')))(
    'enriches the registered ordinary event %s without changing its meaning',
    name => {
      const event: CaptureResult = {
        uuid: 'synthetic-event',
        event: name,
        properties: {
          craft_type: 'coloring_books',
          count: 2,
          path: '/dashboard',
          platform: 'unsafe',
          environment: 'unsafe',
          release: 'unsafe',
        },
      };
      const context = buildWebAnalyticsContext('v1', 'preview', false);
      const result = enrichWebAnalyticsEvent(event, context);
      expect(result).toEqual({ ...event, properties: { ...event.properties, ...context } });
      expect(event.properties.platform).toBe('unsafe');
    }
  );

  it('removes stale SDK release when the current build has no real identity', () => {
    const event: CaptureResult = {
      uuid: 'synthetic-event',
      event: 'project_created',
      properties: { release: 'stale-build', count: 2 },
    };
    expect(
      enrichWebAnalyticsEvent(event, buildWebAnalyticsContext(undefined, undefined, false))
        .properties
    ).toEqual({ platform: 'web', environment: 'other', count: 2 });
  });

  it.each([
    '$exception',
    '$identify',
    '$groupidentify',
    '$autocapture',
    'bootstrap_failure_shown',
    'bootstrap_recovered',
    'unregistered_event',
  ])('leaves diagnostic, identity, and unregistered event %s unchanged', name => {
    const event: CaptureResult = {
      uuid: 'synthetic-event',
      event: name,
      properties: { release: 'diagnostic-release' },
    };
    expect(enrichWebAnalyticsEvent(event, buildWebAnalyticsContext('v1', 'preview', false))).toBe(
      event
    );
  });
});
