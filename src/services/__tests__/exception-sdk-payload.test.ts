import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import posthog from 'posthog-js';
import type { CaptureResult } from 'posthog-js';
import { captureException } from '@/services/analytics-escape-hatch';
import { installBuildGraph, removeBuildGraph } from '@/test-utils/buildGraph';

// Exercise the installed SDK parser, stopping every payload before transport.
describe('exception SDK payload', () => {
  const events: CaptureResult[] = [];
  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network disabled in test')))
    );
    posthog.init('synthetic-local-only', {
      api_host: window.location.origin,
      persistence: 'memory',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      advanced_disable_feature_flags: true,
      request_batching: false,
      respect_dnt: true,
      before_send: event => {
        if (event) events.push(event);
        return null;
      },
    });
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => {
    removeBuildGraph();
    posthog.opt_out_capturing();
  });

  it.each(['v8', 'safari'])(
    'serializes only verified locations and fixed labels (%s)',
    async format => {
      events.length = 0;
      posthog.opt_in_capturing({ captureEventName: false });
      const path = '/assets/ProjectDetail-LongerBuildHash123.js';
      installBuildGraph({ [path]: [] });
      const location = `${window.location.origin}${path}?token=synthetic-private-token`;
      const error = new TypeError('synthetic-private-message');
      Object.defineProperty(error, 'stack', {
        value:
          format === 'v8'
            ? `TypeError: synthetic-private-message\n    at synthetic-private-function (${location}:12:34)`
            : `synthetic-private-function@${location}:12:34`,
      });
      captureException(error);
      await vi.waitFor(() => expect(events.some(event => event.event === '$exception')).toBe(true));
      const event = events.find(event => event.event === '$exception')!;
      const serialized = JSON.stringify(event);
      expect(serialized).toContain(`${path}`);
      expect(serialized).toContain('Application error (message redacted)');
      expect(serialized).not.toMatch(/synthetic-private|\?token=/);
      expect(event.properties.exception_stack_status).toBe('retained');
      expect(event.properties.$exception_list[0].stacktrace.frames).toEqual([
        expect.objectContaining({
          filename: `${window.location.origin}${path}`,
          lineno: 12,
          colno: 34,
        }),
      ]);
    }
  );
});
