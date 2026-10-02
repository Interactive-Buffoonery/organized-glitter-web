import { normalizeError, type ServiceError } from '@/services/errors';
import { isSessionChangedError } from '@/services/auth/sessionRecovery';

/** A failed relationship lookup means the project write has not started. */
export class ProjectRelationLookupError extends Error implements ServiceError {
  readonly reason = 'relation_lookup_failed';
  readonly type: ServiceError['type'];
  readonly status: ServiceError['status'];
  readonly retryable: boolean;

  constructor(
    readonly relation: 'company' | 'artist',
    cause: unknown
  ) {
    super(`Could not load the selected ${relation}`, { cause });
    this.name = 'ProjectRelationLookupError';
    const normalized = normalizeError(cause);
    this.type = normalized.type;
    this.status = normalized.status;
    this.retryable = normalized.retryable;
  }
}

export function isUncertainProjectSaveError(error: unknown): boolean {
  if (error instanceof ProjectRelationLookupError) return false;
  const normalized = normalizeError(error);
  // A gateway may return 5xx after PocketBase has committed the project.
  return (
    normalized.type !== 'auth' &&
    normalized.status !== 401 &&
    normalized.status !== 429 &&
    (normalized.status === 0 ||
      (normalized.status !== undefined && normalized.status >= 500) ||
      normalized.type === 'network' ||
      normalized.type === 'cancelled')
  );
}

export function getProjectSaveErrorMessage(error: unknown): string {
  if (isSessionChangedError(error)) {
    return 'Your session changed while this save completed. Check your library before trying again.';
  }
  const normalized = normalizeError(error);
  if (normalized.type === 'auth' || normalized.status === 401) {
    return 'Please sign in again to save your changes.';
  }

  if (error instanceof ProjectRelationLookupError) {
    if (normalized.type === 'network' || normalized.type === 'server') {
      return `We couldn't connect to load the selected ${error.relation}. Your changes are still here. Try saving again in a moment.`;
    }
    if (normalized.type === 'permission') {
      return `You don't have permission to use the selected ${error.relation}. Your changes are still here.`;
    }
    return `We couldn't load the selected ${error.relation}. Your changes are still here. Please try saving again.`;
  }

  if (isUncertainProjectSaveError(error)) {
    return "We couldn't confirm whether your changes were saved. Check the project before saving again.";
  }

  return "We couldn't save your project. Your changes are still here. Please try saving again.";
}
