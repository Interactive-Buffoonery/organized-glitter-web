/**
 * Centralized error handling for PocketBase operations
 * @author @serabi
 * @created 2025-01-16
 */

import { ClientResponseError } from 'pocketbase';
import { POCKETBASE_ERROR_TYPES, PocketBaseError, ValidationError } from './types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ErrorHandler');

export class ErrorHandler {
  static isAccessFailure(type?: PocketBaseError['type']): boolean {
    return type === 'auth' || type === 'permission' || type === 'not_found';
  }

  /**
   * Type guard to check if an error is already a PocketBaseError.
   * Prevents double-handling when errors pass through multiple catch blocks.
   */
  static isPocketBaseError(error: unknown): error is PocketBaseError {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as Record<string, unknown>;
    return (
      typeof candidate.type === 'string' &&
      (POCKETBASE_ERROR_TYPES as readonly string[]).includes(candidate.type) &&
      typeof candidate.message === 'string' &&
      typeof candidate.retryable === 'boolean'
    );
  }

  /**
   * Convert PocketBase ClientResponseError to our standardized error format
   */
  static handleError(error: unknown, context?: string): PocketBaseError {
    // If already a PocketBaseError (e.g. from handleAsync), return as-is
    // to preserve the original specific error message
    if (ErrorHandler.isPocketBaseError(error)) {
      return error;
    }

    if (error instanceof ClientResponseError) {
      // Handle aborted/cancelled requests
      if (error.isAbort) {
        return {
          type: 'cancelled',
          message: 'Request was cancelled.',
          status: 0,
          retryable: false,
          cause: error,
        };
      }
      return this.handleClientResponseError(error, context);
    }

    // Handle AbortError from fetch API
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        type: 'cancelled',
        message: 'Request was cancelled.',
        retryable: false,
        cause: error,
      };
    }

    // Handle network errors
    if (ErrorHandler.isNetworkError(error)) {
      return {
        type: 'network',
        message: 'Network connection failed. Please check your connection and try again.',
        retryable: true,
        cause: error,
      };
    }

    // Handle generic errors
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    logger.error('Unhandled error', { error, context });

    return {
      type: 'server',
      message,
      retryable: false,
      cause: error,
    };
  }

  /**
   * Handle PocketBase ClientResponseError specifically
   */
  private static handleClientResponseError(
    error: ClientResponseError,
    context?: string
  ): PocketBaseError {
    const { status, data, message } = error;

    logger.error('PocketBase error', {
      status,
      message,
      data,
      context,
      url: error.url,
    });

    switch (status) {
      case 400:
        // Check if this is an authentication-related 400 error
        if (
          context?.toLowerCase()?.includes('authentication') ||
          context?.toLowerCase()?.includes('login')
        ) {
          return this.handleAuthenticationError(error);
        }
        return this.handleValidationError(error);

      case 401:
        return {
          type: 'auth',
          message: 'Authentication required. Please log in and try again.',
          status: 401,
          retryable: false,
          cause: error,
        };

      case 403:
        return {
          type: 'permission',
          message: "You don't have permission to perform this action.",
          status: 403,
          retryable: false,
          cause: error,
        };

      case 404:
        return {
          type: 'not_found',
          message: 'The requested resource was not found.',
          status: 404,
          retryable: false,
          cause: error,
        };

      case 429:
        return {
          type: 'server',
          message: 'Too many requests. Please wait a moment and try again.',
          status: 429,
          retryable: true,
          cause: error,
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          type: 'server',
          message: 'Server error. Please try again later.',
          status,
          retryable: true,
          cause: error,
        };

      default:
        return {
          type: 'server',
          message: message || 'An unexpected error occurred',
          status,
          retryable: false,
          cause: error,
        };
    }
  }

  /**
   * Handle validation errors (400 status)
   *
   * `error.data` on a ClientResponseError is the full API response body
   * (`{data, message, status}`). The per-field validation errors live one
   * level down at `error.data.data`. We accept both shapes so hand-crafted
   * fixtures that construct with the inner shape keep working.
   */
  private static handleValidationError(error: ClientResponseError): PocketBaseError {
    const validationErrors: ValidationError[] = [];

    const outer = error.data as Record<string, unknown> | undefined;
    const fieldBag =
      outer && typeof outer.data === 'object' && outer.data !== null
        ? (outer.data as Record<string, unknown>)
        : outer;

    if (fieldBag && typeof fieldBag === 'object') {
      Object.entries(fieldBag).forEach(([field, errorData]) => {
        if (errorData && typeof errorData === 'object') {
          const fieldError = errorData as { code?: string; message?: string };
          if (fieldError.code || fieldError.message) {
            validationErrors.push({
              code: fieldError.code || 'validation_error',
              message: fieldError.message || 'Invalid value',
              field,
            });
          }
        }
      });
    }

    // Build fieldErrors map for the public contract
    const fieldErrors: Record<string, string> = {};
    for (const ve of validationErrors) {
      if (ve.field) fieldErrors[ve.field] = ve.message;
    }

    return {
      type: 'validation',
      message: this.getValidationMessage(validationErrors),
      status: 400,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      details: { validationErrors },
      retryable: false,
      cause: error,
    };
  }

  /**
   * Handle authentication-specific errors (login failures)
   * Provides clear, actionable messages for common sign-in problems
   */
  private static handleAuthenticationError(error: ClientResponseError): PocketBaseError {
    const { data, message } = error;
    const lowercaseMessage = message?.toLowerCase() || '';

    // Log the full error for debugging
    logger.error('Authentication error details:', {
      status: error.status,
      message: error.message,
      data: error.data,
      url: error.url,
    });

    // Check for specific error patterns from PocketBase
    // PocketBase returns 400 for invalid credentials with specific messages

    // Pattern: "Failed to authenticate" - typically wrong email/password
    if (
      lowercaseMessage.includes('failed to authenticate') ||
      lowercaseMessage.includes('invalid credentials') ||
      lowercaseMessage.includes('invalid login credentials')
    ) {
      return {
        type: 'auth',
        message:
          'The email or password you entered is incorrect. Please check your credentials and try again.',
        retryable: false,
        cause: error,
        details: { errorCode: 'invalid_credentials' },
      };
    }

    // Check data object for more specific errors
    if (data && typeof data === 'object') {
      // Check for identity/email related errors
      if ('identity' in data || 'email' in data) {
        const identityError =
          (data as Record<string, { code?: string; message?: string }>).identity ||
          (data as Record<string, { code?: string; message?: string }>).email;
        if (identityError) {
          const code = identityError.code?.toLowerCase() || '';
          const msg = identityError.message?.toLowerCase() || '';

          if (
            code.includes('required') ||
            msg.includes('required') ||
            msg.includes('cannot be blank')
          ) {
            return {
              type: 'validation',
              message: 'Please enter your email address.',
              retryable: false,
              cause: error,
              details: { errorCode: 'email_required', field: 'email' },
            };
          }

          if (code.includes('invalid') || msg.includes('invalid') || msg.includes('not found')) {
            return {
              type: 'auth',
              message: 'The email or password you entered is incorrect. Please try again.',
              retryable: false,
              cause: error,
              details: { errorCode: 'invalid_credentials' },
            };
          }
        }
      }

      // Check for password-related errors
      if ('password' in data) {
        const passwordError = (data as Record<string, { code?: string; message?: string }>)
          .password;
        if (passwordError) {
          const code = passwordError.code?.toLowerCase() || '';
          const msg = passwordError.message?.toLowerCase() || '';

          if (
            code.includes('required') ||
            msg.includes('required') ||
            msg.includes('cannot be blank')
          ) {
            return {
              type: 'validation',
              message: 'Please enter your password.',
              retryable: false,
              cause: error,
              details: { errorCode: 'password_required', field: 'password' },
            };
          }
        }
      }

      // Check for account-disabled or similar status issues
      if ('user' in data) {
        const userError = (data as Record<string, { code?: string; message?: string }>).user;
        if (userError) {
          const msg = userError.message?.toLowerCase() || '';
          if (msg.includes('disabled') || msg.includes('blocked') || msg.includes('suspended')) {
            return {
              type: 'auth',
              message: 'This account has been disabled. Please contact support for assistance.',
              retryable: false,
              cause: error,
              details: { errorCode: 'account_disabled' },
            };
          }
        }
      }
    }

    // Check for rate limiting
    if (lowercaseMessage.includes('too many') || lowercaseMessage.includes('rate limit')) {
      return {
        type: 'auth',
        message: 'Too many login attempts. Please wait a few minutes before trying again.',
        retryable: true,
        cause: error,
        details: { errorCode: 'rate_limited' },
      };
    }

    // Default authentication error
    return {
      type: 'auth',
      message: 'Unable to sign in. Please verify your email and password are correct.',
      retryable: false,
      cause: error,
      details: { errorCode: 'auth_failed' },
    };
  }

  /**
   * Generate user-friendly message for validation errors
   */
  private static getValidationMessage(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return 'Please check your input and try again.';
    }

    if (errors.length === 1) {
      const error = errors[0];
      return error.field ? `${this.formatFieldName(error.field)}: ${error.message}` : error.message;
    }

    return `Please fix the following errors: ${errors
      .map(e => (e.field ? `${this.formatFieldName(e.field)}: ${e.message}` : e.message))
      .join(', ')}`;
  }

  /**
   * Format field names for user display
   */
  private static formatFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Enhanced network error detection covering multiple failure scenarios
   * @author @serabi
   * @param error - Error to check for network-related issues
   * @returns true if error indicates a network failure, false otherwise
   */
  static isNetworkError(error: unknown): boolean {
    // 1. Check offline state first (supplementary)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }

    // 2. PocketBase ClientResponseError patterns (check before generic Error)
    if (error instanceof ClientResponseError) {
      return error.status === 0 || !error.response;
    }

    // 3. TypeError patterns (most common network errors)
    if (error instanceof TypeError) {
      const message = error.message.toLowerCase();
      return (
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('internet') ||
        message.includes('cancelled') ||
        message.includes('timeout') ||
        message.includes('unreachable')
      );
    }

    // 4. Named error types
    if (error instanceof Error) {
      return ['NetworkError', 'AbortError', 'TimeoutError'].includes(error.name);
    }

    return false;
  }

  /**
   * Check if an error is a cancellation (abort) error.
   * Cancelled requests are transient; PocketBase's requestKey-based
   * auto-cancel aborts the previous in-flight request when a newer one is
   * issued with the same key, so the replacement request is already on the
   * wire. Callers should generally suppress these rather than surfacing them
   * as failures.
   */
  static isCancelledError(error: unknown): boolean {
    if (ErrorHandler.isPocketBaseError(error) && error.type === 'cancelled') return true;
    if (error instanceof ClientResponseError && error.isAbort) return true;
    if (error instanceof Error && error.name === 'AbortError') return true;
    return false;
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: PocketBaseError): boolean {
    return error.retryable;
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: PocketBaseError): string {
    return error.message;
  }

  /**
   * Log error for diagnostics
   */
  static logError(error: PocketBaseError, context?: string): void {
    logger.criticalError('PocketBase operation failed', {
      type: error.type,
      message: error.message,
      details: error.details,
      context,
      cause: error.cause,
    });
  }

  /**
   * Create a standardized error for common scenarios
   */
  static createError(
    type: PocketBaseError['type'],
    message: string,
    retryable: boolean = false,
    details?: Record<string, unknown>
  ): PocketBaseError {
    return {
      type,
      message,
      retryable,
      details,
    };
  }

  /**
   * Handle async operations with error transformation
   */
  static async handleAsync<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.handleError(error, context);
    }
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    context?: string
  ): Promise<T> {
    let lastError: PocketBaseError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.handleError(error, context);

        if (!this.isRetryable(lastError) || attempt === maxRetries) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        logger.debug(
          `Retrying operation after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}
