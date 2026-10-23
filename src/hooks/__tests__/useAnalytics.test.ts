import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsPath } from '../useAnalytics';

describe('sanitizeAnalyticsPath', () => {
  it('redacts auth tokens from analytics paths', () => {
    expect(sanitizeAnalyticsPath('/auth/confirm-password-reset/reset-token-123')).toBe(
      '/auth/confirm-password-reset/[redacted]'
    );
    expect(sanitizeAnalyticsPath('/auth/verify-email/verify-token-123')).toBe(
      '/auth/verify-email/[redacted]'
    );
    expect(sanitizeAnalyticsPath('/auth/confirm-email-change/email-token-123')).toBe(
      '/auth/confirm-email-change/[redacted]'
    );
  });
});
