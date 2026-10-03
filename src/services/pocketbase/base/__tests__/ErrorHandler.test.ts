import { describe, it, expect } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { ErrorHandler } from '../ErrorHandler';
import { PocketBaseError } from '../types';

describe('ErrorHandler', () => {
  describe('isPocketBaseError', () => {
    it('should recognize a valid PocketBaseError object', () => {
      const error: PocketBaseError = {
        type: 'server',
        message: 'Server error. Please try again later.',
        retryable: true,
      };
      expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
    });

    it('should recognize all valid error types', () => {
      const types = [
        'network',
        'validation',
        'auth',
        'permission',
        'not_found',
        'server',
        'cancelled',
      ] as const;
      for (const type of types) {
        const error: PocketBaseError = { type, message: 'test', retryable: false };
        expect(ErrorHandler.isPocketBaseError(error)).toBe(true);
      }
    });

    it('should reject null, undefined, and non-objects', () => {
      expect(ErrorHandler.isPocketBaseError(null)).toBe(false);
      expect(ErrorHandler.isPocketBaseError(undefined)).toBe(false);
      expect(ErrorHandler.isPocketBaseError('string')).toBe(false);
      expect(ErrorHandler.isPocketBaseError(new Error('test'))).toBe(false);
    });

    it('should reject objects missing required fields', () => {
      expect(ErrorHandler.isPocketBaseError({ type: 'server', message: 'test' })).toBe(false);
      expect(ErrorHandler.isPocketBaseError({ type: 'server', retryable: false })).toBe(false);
      expect(ErrorHandler.isPocketBaseError({ message: 'test', retryable: false })).toBe(false);
    });

    it('should reject objects with invalid type values', () => {
      expect(
        ErrorHandler.isPocketBaseError({ type: 'unknown', message: 'test', retryable: false })
      ).toBe(false);
    });
  });

  describe('handleError - idempotency', () => {
    it('should return PocketBaseError as-is without modifying the message', () => {
      const originalError: PocketBaseError = {
        type: 'auth',
        message: 'Authentication required. Please log in and try again.',
        retryable: false,
      };

      const result = ErrorHandler.handleError(originalError, 'Project query');

      expect(result).toBe(originalError);
      expect(result.message).toBe('Authentication required. Please log in and try again.');
    });

    it('should preserve network error messages through double handling', () => {
      const originalError: PocketBaseError = {
        type: 'network',
        message: 'Network connection failed. Please check your connection and try again.',
        retryable: true,
      };

      const result = ErrorHandler.handleError(originalError, 'some context');

      expect(result).toBe(originalError);
      expect(result.message).toBe(
        'Network connection failed. Please check your connection and try again.'
      );
    });

    it('should preserve server error messages through double handling', () => {
      const originalError: PocketBaseError = {
        type: 'server',
        message: 'Server error. Please try again later.',
        retryable: true,
      };

      const result = ErrorHandler.handleError(originalError, 'Project query');

      expect(result).toBe(originalError);
      expect(result.message).toBe('Server error. Please try again later.');
    });
  });

  describe('handleError - standard errors', () => {
    it('should handle standard Error instances with their message and cause', () => {
      const error = new Error('Something went wrong');
      const result = ErrorHandler.handleError(error, 'test');

      expect(result.type).toBe('server');
      expect(result.message).toBe('Something went wrong');
      expect(result.retryable).toBe(false);
      expect(result.cause).toBe(error);
    });

    it('should handle unknown error types with generic message', () => {
      const result = ErrorHandler.handleError('string error', 'test');

      expect(result.type).toBe('server');
      expect(result.message).toBe('An unexpected error occurred');
      expect(result.retryable).toBe(false);
    });
  });

  describe('handleError - ClientResponseError', () => {
    it('should handle 401 as auth error with status and cause', () => {
      const error = new ClientResponseError({ status: 401, message: 'Unauthorized', data: {} });
      const result = ErrorHandler.handleError(error, 'test');

      expect(result.type).toBe('auth');
      expect(result.message).toBe('Authentication required. Please log in and try again.');
      expect(result.status).toBe(401);
      expect(result.cause).toBe(error);
    });

    it('should handle 500 as retryable server error with status and cause', () => {
      const error = new ClientResponseError({
        status: 500,
        message: 'Internal Server Error',
        data: {},
      });
      const result = ErrorHandler.handleError(error, 'test');

      expect(result.type).toBe('server');
      expect(result.message).toBe('Server error. Please try again later.');
      expect(result.retryable).toBe(true);
      expect(result.status).toBe(500);
      expect(result.cause).toBe(error);
    });

    it('should handle abort errors as cancelled', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      const result = ErrorHandler.handleError(error, 'test');

      expect(result.type).toBe('cancelled');
      expect(result.retryable).toBe(false);
      expect(result.cause).toBe(error);
    });
  });

  describe('handleAsync - double handling scenario', () => {
    it('should preserve specific error messages when caught and re-handled', async () => {
      const clientError = new ClientResponseError({
        status: 500,
        message: 'Internal Server Error',
        data: {},
      });

      let caughtError: unknown;
      try {
        await ErrorHandler.handleAsync(async () => {
          throw clientError;
        }, 'Project query');
      } catch (error) {
        caughtError = error;
      }

      // caughtError is now a PocketBaseError from handleAsync
      expect(ErrorHandler.isPocketBaseError(caughtError)).toBe(true);

      // Simulate the outer catch calling handleError again (the bug scenario)
      const result = ErrorHandler.handleError(caughtError, 'Project query');

      // Before fix: "An unexpected error occurred"
      // After fix: preserves the original message
      expect(result.message).toBe('Server error. Please try again later.');
      expect(result.type).toBe('server');
      expect(result.retryable).toBe(true);
    });

    it('should preserve auth error messages through double handling', async () => {
      const clientError = new ClientResponseError({
        status: 401,
        message: 'Unauthorized',
        data: {},
      });

      let caughtError: unknown;
      try {
        await ErrorHandler.handleAsync(async () => {
          throw clientError;
        }, 'test');
      } catch (error) {
        caughtError = error;
      }

      const result = ErrorHandler.handleError(caughtError, 'test');

      expect(result.message).toBe('Authentication required. Please log in and try again.');
      expect(result.type).toBe('auth');
    });
  });
});
