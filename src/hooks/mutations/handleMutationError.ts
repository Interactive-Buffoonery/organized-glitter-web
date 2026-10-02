import { notify } from '@/lib/notifications';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { PocketBaseError } from '@/services/pocketbase/base/types';
import { createLogger } from '@/utils/logger';
import { isSessionChangedError } from '@/services/auth/sessionRecovery';

const logger = createLogger('handleMutationError');

const sentenceCase = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * Normalizes a mutation error and surfaces it to the user.
 *
 * Routes the raw error through `ErrorHandler` so PocketBase validation
 * messages ("title is required", "company: invalid value") reach the toast
 * instead of being collapsed into a generic "<context> failed". Field-level
 * errors are logged for now and will be wired through to form fields in a
 * follow-up; surfacing them in the toast title gives users an actionable
 * message even before per-field rendering exists.
 *
 * Cancelled requests are intentionally swallowed: PocketBase's auto-cancel
 * aborts the previous in-flight request when a newer one is issued with the
 * same key, and the replacement is already on the wire.
 */
export const handleMutationError = (error: unknown, context: string): void => {
  if (isSessionChangedError(error)) return;
  if (ErrorHandler.isCancelledError(error)) return;

  const normalized: PocketBaseError = ErrorHandler.handleError(error, context);

  logger.error(`Error ${context}:`, {
    type: normalized.type,
    message: normalized.message,
    status: normalized.status,
    fieldErrors: normalized.fieldErrors,
    retryable: normalized.retryable,
  });

  // PocketBase validation gives us a real message ("Title: cannot be blank").
  // For everything else (network, server 5xx, generic Error from app code) the
  // ErrorHandler.message is already a user-facing sentence. Either way, the
  // failure title should be specific to the action.
  const failureTitle = `${sentenceCase(context)} failed`;
  const description = normalized.message;

  notify({
    kind: 'error',
    title: failureTitle,
    description,
  });
};
