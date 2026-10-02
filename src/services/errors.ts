/**
 * Public error utilities for the service layer.
 *
 * Hooks and pages use these helpers instead of importing ClientResponseError
 * from 'pocketbase' directly. This keeps the SDK type contained inside services.
 */

import { ErrorHandler } from './pocketbase/base/ErrorHandler';
import type { ServiceError } from './types';
import { isServiceError } from './types';

// Re-export the type guard for convenience
export { isServiceError } from './types';
export type { ServiceError } from './types';

/**
 * Normalize any error into a ServiceError.
 * Use in catch blocks to get a consistent, SDK-agnostic error shape.
 */
export function normalizeError(error: unknown, context?: string): ServiceError {
  // Already a ServiceError, return as-is
  if (isServiceError(error)) return error;

  // Delegate to ErrorHandler which knows about ClientResponseError
  const handled = ErrorHandler.handleError(error, context);

  return {
    type: handled.type,
    message: handled.message,
    status: handled.status,
    fieldErrors: handled.fieldErrors,
    retryable: handled.retryable,
    cause: handled.cause,
  };
}

/**
 * Check if an error should NOT be retried (client errors, validation, auth, etc.).
 * Use in React Query `retry` callbacks.
 *
 * @example
 * retry: (failureCount, error) => {
 *   if (isNonRetryableError(error)) return false;
 *   return failureCount < 2;
 * }
 */
export function isNonRetryableError(error: unknown): boolean {
  if (isServiceError(error)) return !error.retryable;
  // Use ErrorHandler to check; it knows about ClientResponseError
  if (ErrorHandler.isPocketBaseError(error)) return !error.retryable;
  const normalized = normalizeError(error);
  return !normalized.retryable;
}

/**
 * Extract a user-friendly error message from any error.
 */
export function getErrorMessage(error: unknown): string {
  if (isServiceError(error)) return error.message;
  if (ErrorHandler.isPocketBaseError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

/**
 * Extract HTTP status code from any error, if available.
 */
function getErrorStatus(error: unknown): number | undefined {
  if (isServiceError(error)) return error.status;
  if (ErrorHandler.isPocketBaseError(error)) return error.status;
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/**
 * Check if an error has a specific HTTP status code.
 * Works with raw SDK errors, PocketBaseError, and ServiceError.
 */
export function hasErrorStatus(error: unknown, status: number): boolean {
  return getErrorStatus(error) === status;
}

/**
 * Check if an error is a validation error (400).
 */
export function isValidationError(error: unknown): boolean {
  const normalized = isServiceError(error) ? error : normalizeError(error);
  return normalized.type === 'validation';
}

/**
 * Get field-level validation errors, if any.
 */
function getFieldErrors(error: unknown): Record<string, string> | undefined {
  if (isServiceError(error)) return error.fieldErrors;
  const normalized = normalizeError(error);
  return normalized.fieldErrors;
}

/**
 * Detect PocketBase's `validation_invalid_mime_type` rejection on an `image`
 * field. Returned message is the raw server text so it can be surfaced to the
 * user and included in a diagnostic email.
 */
export function isImageMimeRejection(error: unknown): { message: string } | null {
  const fieldErrors = getFieldErrors(error);
  const imageError = fieldErrors?.image;
  if (imageError && /mime type/i.test(imageError)) {
    return { message: imageError };
  }
  return null;
}

/** Detect a PocketBase taxonomy deletion guard rejection. */
export function isRecordInUseError(error: unknown): boolean {
  const cause = isServiceError(error) ? error.cause : undefined;
  const messages = [
    getErrorMessage(error),
    ...Object.values(getFieldErrors(error) ?? {}),
    ...(cause ? [getErrorMessage(cause)] : []),
  ];
  return messages.some(message =>
    /still in use|remove it from existing records|not part of a required relation reference/i.test(
      message
    )
  );
}
