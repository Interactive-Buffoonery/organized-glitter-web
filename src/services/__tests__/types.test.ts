/**
 * Tests for service layer type guards and contracts
 */
import { describe, it, expect } from 'vitest';
import { isServiceError, SERVICE_ERROR_TYPES } from '../types';
import type { ServiceError } from '../types';

describe('isServiceError', () => {
  it('returns true for a valid ServiceError', () => {
    const error: ServiceError = {
      type: 'validation',
      message: 'Name is required',
      retryable: false,
    };
    expect(isServiceError(error)).toBe(true);
  });

  it('returns true for all valid error types', () => {
    for (const type of SERVICE_ERROR_TYPES) {
      expect(isServiceError({ type, message: 'test', retryable: false })).toBe(true);
    }
  });

  it('returns false for plain Error', () => {
    expect(isServiceError(new Error('nope'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isServiceError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isServiceError(undefined)).toBe(false);
  });

  it('returns false for object missing type', () => {
    expect(isServiceError({ message: 'test', retryable: false })).toBe(false);
  });

  it('returns false for object with invalid type', () => {
    expect(isServiceError({ type: 'banana', message: 'test', retryable: false })).toBe(false);
  });

  it('returns false for object missing retryable', () => {
    expect(isServiceError({ type: 'auth', message: 'test' })).toBe(false);
  });

  it('accepts optional fields', () => {
    const error: ServiceError = {
      type: 'validation',
      message: 'Bad input',
      status: 400,
      fieldErrors: { name: 'required' },
      retryable: false,
      cause: new Error('original'),
    };
    expect(isServiceError(error)).toBe(true);
  });
});

describe('SERVICE_ERROR_TYPES', () => {
  it('includes all expected error types', () => {
    expect(SERVICE_ERROR_TYPES).toContain('network');
    expect(SERVICE_ERROR_TYPES).toContain('validation');
    expect(SERVICE_ERROR_TYPES).toContain('auth');
    expect(SERVICE_ERROR_TYPES).toContain('permission');
    expect(SERVICE_ERROR_TYPES).toContain('not_found');
    expect(SERVICE_ERROR_TYPES).toContain('server');
    expect(SERVICE_ERROR_TYPES).toContain('cancelled');
  });

  it('has exactly 7 error types', () => {
    expect(SERVICE_ERROR_TYPES).toHaveLength(7);
  });
});
