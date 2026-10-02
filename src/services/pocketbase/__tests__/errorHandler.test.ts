/**
 * Tests for ErrorHandler: verifies all error types normalize to PocketBaseError/ServiceError
 * Covers: ClientResponseError mapping, network errors, AbortError, generic errors,
 * double-handling prevention, all HTTP status codes
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
  }),
}));

import { ErrorHandler } from '../base/ErrorHandler';

// Patch the prototype so `instanceof ClientResponseError` works in ErrorHandler
// We need to use the actual import to make this work
vi.mock('pocketbase', () => {
  class ClientResponseError extends Error {
    status: number;
    data: Record<string, unknown>;
    url: string;
    response: Record<string, unknown>;
    isAbort: boolean;

    constructor(
      info: {
        status?: number;
        data?: Record<string, unknown>;
        message?: string;
        isAbort?: boolean;
        url?: string;
      } = {}
    ) {
      super(info.message || 'Mock error');
      this.name = 'ClientResponseError';
      this.status = info.status || 0;
      this.data = info.data || {};
      this.url = info.url || '';
      this.response = {};
      this.isAbort = info.isAbort || false;
    }
  }
  return { ClientResponseError };
});

// Re-import after mock
const { ClientResponseError } = await import('pocketbase');

describe('ErrorHandler', () => {
  describe('handleError()', () => {
    it('maps 400 to validation error', () => {
      const error = new ClientResponseError({
        status: 400,
        data: { name: { code: 'required', message: 'Name is required' } },
      });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('validation');
      expect(result.retryable).toBe(false);
    });

    it('maps 401 to auth error', () => {
      const error = new ClientResponseError({ status: 401 });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('auth');
      expect(result.retryable).toBe(false);
    });

    it('maps 403 to permission error', () => {
      const error = new ClientResponseError({ status: 403 });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('permission');
      expect(result.retryable).toBe(false);
    });

    it('maps 404 to not_found error', () => {
      const error = new ClientResponseError({ status: 404 });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('not_found');
      expect(result.retryable).toBe(false);
    });

    it('maps 429 to server error with retryable=true', () => {
      const error = new ClientResponseError({ status: 429 });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('server');
      expect(result.retryable).toBe(true);
    });

    it('maps 500 to server error with retryable=true', () => {
      const error = new ClientResponseError({ status: 500 });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('server');
      expect(result.retryable).toBe(true);
    });

    it('maps aborted request to cancelled error', () => {
      const error = new ClientResponseError({ isAbort: true });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('cancelled');
      expect(result.retryable).toBe(false);
    });

    it('maps AbortError to cancelled', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('cancelled');
    });

    it('maps TypeError with "fetch" to network error', () => {
      const error = new TypeError('Failed to fetch');
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('network');
      expect(result.retryable).toBe(true);
    });

    it('maps generic Error to server error', () => {
      const result = ErrorHandler.handleError(new Error('Something broke'));
      expect(result.type).toBe('server');
      expect(result.message).toBe('Something broke');
    });

    it('does not double-wrap PocketBaseError', () => {
      const original = ErrorHandler.createError('validation', 'Already normalized', false, {
        field: 'name',
      });
      const result = ErrorHandler.handleError(original);
      expect(result).toBe(original); // Same reference
    });

    it('preserves cause for all error types', () => {
      const error = new ClientResponseError({ status: 404 });
      const result = ErrorHandler.handleError(error);
      expect(result.cause).toBe(error);
    });

    it('extracts fieldErrors from validation errors', () => {
      const error = new ClientResponseError({
        status: 400,
        data: {
          name: { code: 'required', message: 'Name is required' },
          email: { code: 'invalid', message: 'Invalid email format' },
        },
      });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('validation');
      expect(result.fieldErrors).toEqual({
        name: 'Name is required',
        email: 'Invalid email format',
      });
    });

    // Matches the shape PocketBase's SDK actually produces at runtime; the full
    // response body lives on `error.data`, with per-field errors nested under
    // `error.data.data`. Previously this was silently mis-parsed and yielded a
    // single fieldErrors entry keyed `data` with message `Invalid value`.
    it('extracts fieldErrors when the SDK nests them under data.data', () => {
      const error = new ClientResponseError({
        status: 400,
        data: {
          data: {
            image: {
              code: 'validation_invalid_mime_type',
              message: '"foo.jpg" mime type must be one of: image/png, image/jpeg, ...',
            },
          },
          message: 'Failed to update record.',
          status: 400,
        },
      });
      const result = ErrorHandler.handleError(error);
      expect(result.type).toBe('validation');
      expect(result.fieldErrors).toEqual({
        image: '"foo.jpg" mime type must be one of: image/png, image/jpeg, ...',
      });
    });
  });

  describe('isPocketBaseError()', () => {
    it('returns true for well-formed PocketBaseError', () => {
      const error = ErrorHandler.createError('validation', 'Test', false);
      expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
    });

    it('returns false for plain Error', () => {
      expect(ErrorHandler.isPocketBaseError(new Error('nope'))).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(ErrorHandler.isPocketBaseError(null)).toBe(false);
      expect(ErrorHandler.isPocketBaseError(undefined)).toBe(false);
    });
  });

  describe('handleAsync()', () => {
    it('returns result on success', async () => {
      const result = await ErrorHandler.handleAsync(async () => 42);
      expect(result).toBe(42);
    });

    it('throws normalized PocketBaseError on failure', async () => {
      try {
        await ErrorHandler.handleAsync(async () => {
          throw new Error('boom');
        }, 'test-context');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
        if (ErrorHandler.isPocketBaseError(error)) {
          expect(error.type).toBe('server');
          expect(error.message).toBe('boom');
        }
      }
    });
  });

  describe('createError()', () => {
    it('creates a well-formed error', () => {
      const error = ErrorHandler.createError('permission', 'Not allowed', false);
      expect(error).toEqual({
        type: 'permission',
        message: 'Not allowed',
        retryable: false,
      });
    });

    it('creates an error with details', () => {
      const error = ErrorHandler.createError('validation', 'Bad input', false, { field: 'name' });
      expect(error.details).toEqual({ field: 'name' });
    });
  });
});
