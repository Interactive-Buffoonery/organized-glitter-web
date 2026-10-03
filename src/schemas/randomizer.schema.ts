import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { PocketBaseError } from '@/services/pocketbase/base/types';

export interface CreateSpinValidationParams {
  user: string;
  project?: string;
  project_title: string;
  selected_projects: string[];
}

const isPbId = (v: unknown): v is string => typeof v === 'string' && v.length === 15;

function throwValidation(
  message: string,
  suggestedAction: string,
  extra?: Record<string, unknown>
): never {
  const err: PocketBaseError = ErrorHandler.createError('validation', message, false, {
    randomizerType: 'VALIDATION_ERROR',
    canRetry: false,
    suggestedAction,
    ...extra,
  });
  throw err;
}

export function validateCreateSpinParams(params: CreateSpinValidationParams): void {
  if (!isPbId(params.user)) {
    throwValidation(
      'Invalid user ID - must be a 15-character PocketBase ID',
      'Please ensure you are properly authenticated'
    );
  }

  if (params.project && !isPbId(params.project)) {
    throwValidation(
      'Invalid project ID - must be a 15-character PocketBase ID',
      'Please select a valid project'
    );
  }

  if (
    !params.project_title ||
    typeof params.project_title !== 'string' ||
    params.project_title.trim().length === 0
  ) {
    throwValidation(
      'Project title is required and cannot be empty',
      'Please ensure the project has a valid title'
    );
  }

  if (!Array.isArray(params.selected_projects) || params.selected_projects.length < 1) {
    throwValidation(
      'At least 1 target must be in the randomizer pool',
      'Please include at least 1 target before spinning'
    );
  }

  const invalidProjectIds = params.selected_projects.filter(id => !isPbId(id));
  if (invalidProjectIds.length > 0) {
    throwValidation(
      `Invalid project IDs found: ${invalidProjectIds.join(', ')}`,
      'Please refresh the project list and try again'
    );
  }
}

export function validateUserIdOnly(userId: string): void {
  if (!isPbId(userId)) {
    throwValidation(
      'Invalid user ID - must be a 15-character PocketBase ID',
      'Please ensure you are properly authenticated'
    );
  }
}

export function validateSpinIdOnly(spinId: string): void {
  if (!isPbId(spinId)) {
    throwValidation(
      'Invalid spin ID - must be a 15-character PocketBase ID',
      'Please refresh the randomizer history and try again'
    );
  }
}
