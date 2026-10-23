import { describe, it, expect } from 'vitest';
import { buildExceptionContext } from '@/utils/error/exceptionContext';

describe('exceptionContext', () => {
  describe('buildExceptionContext', () => {
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
  });
});
