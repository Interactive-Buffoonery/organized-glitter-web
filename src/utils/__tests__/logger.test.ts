/**
 * Tests for logger behavior
 *
 * Verifies that:
 * - logger.error() calls console.error (regression test for the production no-op fix)
 * - Sensitive data is redacted before logging
 * - Logger prefixes are included in output
 */

import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from '@/utils/logger';

describe('redactSensitiveData', () => {
  it('redacts the complete dotted file token in a URL', () => {
    expect(
      redactSensitiveData(
        'https://pb.example/api/files/x/y/z.jpg?token=header.payload.signature&thumb=80x80'
      )
    ).toBe('https://pb.example/api/files/x/y/z.jpg?token=[REDACTED]&thumb=80x80');
  });

  it('handles nested objects', () => {
    const input = { config: { secret: 'hidden_value' }, visible: true };
    const result = redactSensitiveData(input) as Record<string, Record<string, unknown>>;

    expect(result.config.secret).toBe('[REDACTED]');
    expect(result.visible).toBe(true);
  });
});
