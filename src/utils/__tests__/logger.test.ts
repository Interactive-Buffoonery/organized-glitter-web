/**
 * Tests for logger behavior
 *
 * Verifies that:
 * - logger.error() calls console.error (regression test for the production no-op fix)
 * - Sensitive data is redacted before logging
 * - Logger prefixes are included in output
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, redactSensitiveData } from '@/utils/logger';

describe('Logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('logger.error() calls console.error', () => {
    const logger = createLogger('TestModule');
    logger.error('Something went wrong', { code: 500 });

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logger.error() includes prefix in output', () => {
    const logger = createLogger('MyModule');
    logger.error('test error message');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const firstArg = consoleErrorSpy.mock.calls[0][0];
    expect(firstArg).toContain('MyModule');
  });

  it('logger.criticalError() calls console.error', () => {
    const logger = createLogger('Critical');
    logger.criticalError('fatal issue');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const firstArg = consoleErrorSpy.mock.calls[0][0];
    expect(firstArg).toContain('Critical');
  });
});

describe('redactSensitiveData', () => {
  it('redacts the complete dotted file token in a URL', () => {
    expect(
      redactSensitiveData(
        'https://pb.example/api/files/x/y/z.jpg?token=header.payload.signature&thumb=80x80'
      )
    ).toBe('https://pb.example/api/files/x/y/z.jpg?token=[REDACTED]&thumb=80x80');
  });
  it('redacts api_key fields in objects', () => {
    const input = { api_key: 'sk-1234567890abcdef', user: 'bob' };
    const result = redactSensitiveData(input) as Record<string, unknown>;

    expect(result.api_key).toBe('[REDACTED]');
    expect(result.user).toBe('bob');
  });

  it('redacts token fields in objects', () => {
    const input = { auth_token: 'abc123456789', name: 'test' };
    const result = redactSensitiveData(input) as Record<string, unknown>;

    expect(result.auth_token).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('redacts password fields in objects', () => {
    const input = { password: 'mysecret123', email: 'test@test.com' };
    const result = redactSensitiveData(input) as Record<string, unknown>;

    expect(result.password).toBe('[REDACTED]');
    expect(result.email).toBe('test@test.com');
  });

  it('does not redact non-sensitive fields', () => {
    const input = { name: 'Alice', count: 42 };
    const result = redactSensitiveData(input) as Record<string, unknown>;

    expect(result.name).toBe('Alice');
    expect(result.count).toBe(42);
  });

  it('handles nested objects', () => {
    const input = { config: { secret: 'hidden_value' }, visible: true };
    const result = redactSensitiveData(input) as Record<string, Record<string, unknown>>;

    expect(result.config.secret).toBe('[REDACTED]');
    expect(result.visible).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(redactSensitiveData('hello')).toBe('hello');
    expect(redactSensitiveData(42)).toBe(42);
    expect(redactSensitiveData(null)).toBe(null);
  });

  it('handles circular references without crashing', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;

    expect(() => redactSensitiveData(obj)).not.toThrow();
    const result = redactSensitiveData(obj) as Record<string, unknown>;
    expect(result.self).toBe('[Circular Reference]');
  });
});
