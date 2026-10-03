/**
 * Core type definitions for PocketBase service layer
 * @author @serabi
 * @created 2025-07-16
 */

export interface ListResult<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

// Error types, aligned with ServiceError contract (see src/services/types.ts)
export const POCKETBASE_ERROR_TYPES = [
  'network',
  'validation',
  'auth',
  'permission',
  'not_found',
  'server',
  'cancelled',
] as const;
export type PocketBaseErrorType = (typeof POCKETBASE_ERROR_TYPES)[number];

export interface PocketBaseError {
  type: PocketBaseErrorType;
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  /** Opaque original error; consumers must NOT depend on its shape */
  cause?: unknown;
  /** @internal Structured details (validation sub-errors, error codes, etc.) */
  details?: Record<string, unknown>;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}
