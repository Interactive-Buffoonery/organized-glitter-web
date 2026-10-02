import { describe, it, expect } from 'vitest';
import {
  buildExceptionContext,
  classifyExternalError,
  markAppMounted,
  isAppMounted,
  truncateComponentStack,
} from '@/utils/error/exceptionContext';

describe('exceptionContext', () => {
  describe('buildExceptionContext', () => {
    it('includes the source and safe location fields', () => {
      const ctx = buildExceptionContext('unit_test');
      expect(ctx.$exception_source).toBe('unit_test');
      expect(ctx.route).toBe(window.location.pathname);
      expect(ctx.host).toBe(window.location.host);
    });

    it('reads navigator fields when present', () => {
      const ctx = buildExceptionContext('unit_test');
      expect(ctx.user_agent).toBe(navigator.userAgent);
    });

    it('redacts reset tokens from exception routes', () => {
      const originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState({}, '', '/auth/confirm-password-reset/header.payload.signature');

      try {
        const ctx = buildExceptionContext('unit_test');

        expect(ctx.route).toBe('/auth/confirm-password-reset/[redacted]');
      } finally {
        window.history.replaceState({}, '', originalPath);
      }
    });

    it('merges extra last so caller props win over defaults', () => {
      const ctx = buildExceptionContext('default_source', {
        $exception_source: 'caller_source',
        route: '/explicit-route',
        custom: 'value',
      });
      expect(ctx.$exception_source).toBe('caller_source');
      expect(ctx.route).toBe('/explicit-route');
      expect(ctx.custom).toBe('value');
    });

    it('never throws even if globals are unavailable', () => {
      const originalLocation = window.location;
      // Force a throwing getter to simulate a hostile/missing global.
      Object.defineProperty(window, 'location', {
        configurable: true,
        get() {
          throw new Error('no location');
        },
      });

      try {
        const ctx = buildExceptionContext('resilient');
        // Source is set before the throwing access; the rest is best-effort.
        expect(ctx.$exception_source).toBe('resilient');
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    });
  });

  describe('mounted flag', () => {
    it('reports mounted after markAppMounted is called', () => {
      markAppMounted();
      expect(isAppMounted()).toBe(true);
      expect(buildExceptionContext('x').app_initialized).toBe(true);
    });
  });

  describe('truncateComponentStack', () => {
    it('returns undefined for empty input', () => {
      expect(truncateComponentStack(undefined)).toBeUndefined();
      expect(truncateComponentStack(null)).toBeUndefined();
      expect(truncateComponentStack('')).toBeUndefined();
    });

    it('passes short stacks through unchanged', () => {
      expect(truncateComponentStack('at Foo\nat Bar')).toBe('at Foo\nat Bar');
    });

    it('truncates very long stacks', () => {
      const long = 'x'.repeat(5000);
      const result = truncateComponentStack(long)!;
      expect(result.length).toBeLessThan(long.length);
      expect(result.endsWith('[truncated]')).toBe(true);
    });
  });

  describe('classifyExternalError', () => {
    it('flags an error with an extension frame in the stack', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at chrome-extension://abcd/content.js:1:1';
      expect(classifyExternalError(err)).toEqual({
        suspected_external_script: true,
        error_origin: 'browser_extension_or_external',
      });
    });

    it('flags moz-extension and safari-web-extension frames', () => {
      const moz = new Error('x');
      moz.stack = 'at moz-extension://x/y.js:1:1';
      expect(classifyExternalError(moz).suspected_external_script).toBe(true);

      const safari = new Error('x');
      safari.stack = 'at safari-web-extension://x/y.js:1:1';
      expect(classifyExternalError(safari).suspected_external_script).toBe(true);
    });

    it('flags the runtime.sendMessage / Tab not found extension messaging error', () => {
      const err = new Error(
        'Unchecked runtime.lastError: Could not establish connection. runtime.sendMessage(). Tab not found'
      );
      expect(classifyExternalError(err).suspected_external_script).toBe(true);
    });

    it('flags the reconstructed cross-origin masked error by prefix', () => {
      // This is exactly what the global handler builds when event.error is null.
      const err = new Error('Script error. at :0:0');
      expect(classifyExternalError(err)).toEqual({
        suspected_external_script: true,
        error_origin: 'browser_extension_or_external',
      });
    });

    it('flags the bare cross-origin masked error', () => {
      expect(classifyExternalError(new Error('Script error.')).suspected_external_script).toBe(
        true
      );
    });

    it('does NOT flag a normal application error', () => {
      const err = new Error('Cannot read properties of undefined (reading foo)');
      err.stack = 'Error\n    at https://organizedglitter.app/assets/index-abc.js:10:20';
      expect(classifyExternalError(err)).toEqual({ suspected_external_script: false });
    });

    it('handles string and null inputs without throwing', () => {
      expect(classifyExternalError('Script error.').suspected_external_script).toBe(true);
      expect(classifyExternalError(null).suspected_external_script).toBe(false);
      expect(classifyExternalError(undefined).suspected_external_script).toBe(false);
    });
  });
});
