import { describe, expect, it } from 'vitest';
import {
  getProjectSaveErrorMessage,
  isUncertainProjectSaveError,
  ProjectRelationLookupError,
} from '../projectSaveError';
import { SessionChangedError } from '@/services/auth/sessionRecovery';

describe('project save outcome classification', () => {
  it('treats a failed relation lookup as definite even when its cause is a 503', () => {
    const error = new ProjectRelationLookupError('artist', {
      type: 'server',
      status: 503,
      retryable: true,
      message: 'Lookup unavailable',
    });
    expect(isUncertainProjectSaveError(error)).toBe(false);
  });

  it.each([
    ['authentication', 'auth', undefined],
    ['expired session', 'server', 401],
    ['rate limit', 'server', 429],
  ] as const)('treats a retryable %s response as a definite failure', (_, type, status) => {
    expect(
      isUncertainProjectSaveError({ type, status, retryable: true, message: 'Save rejected' })
    ).toBe(false);
  });

  it.each([
    ['network failure', 'network', undefined],
    ['status zero', 'server', 0],
    ['cancelled request', 'cancelled', undefined],
    ['internal server error', 'server', 500],
    ['bad gateway', 'server', 502],
    ['service unavailable', 'server', 503],
    ['gateway timeout', 'server', 504],
  ] as const)('keeps metadata when a %s leaves the write outcome unknown', (_, type, status) => {
    expect(isUncertainProjectSaveError({ type, status, retryable: true, message: type })).toBe(
      true
    );
  });
});

describe('project save error messages', () => {
  it('keeps a confirmed old-session write distinct from an auth rejection', () => {
    const error = new SessionChangedError();
    expect(error.reason).toBe('session_changed');
  });
  it.each(['company', 'artist'] as const)(
    'names the failed %s lookup without asking for a different selection',
    relation => {
      const cause = { type: 'network', status: 0, retryable: true, message: 'Network failure' };
      const error = new ProjectRelationLookupError(relation, cause);
      expect(error.cause).toBe(cause);
      expect(getProjectSaveErrorMessage(error)).toBe(
        `We couldn't connect to load the selected ${relation}. Your changes are still here. Try saving again in a moment.`
      );
    }
  );

  it('uses the agreed server-failure message even when automatic retry is disabled', () => {
    const error = new ProjectRelationLookupError('company', {
      type: 'server',
      retryable: false,
      message: 'Lookup failed',
    });
    expect(getProjectSaveErrorMessage(error)).toBe(
      "We couldn't connect to load the selected company. Your changes are still here. Try saving again in a moment."
    );
  });

  it('asks for sign-in when the lookup fails with an expired session', () => {
    const error = new ProjectRelationLookupError('artist', {
      type: 'auth',
      status: 401,
      retryable: false,
      message: 'Session expired',
    });
    expect(getProjectSaveErrorMessage(error)).toBe('Please sign in again to save your changes.');
  });

  it('does not promise a retry will resolve a permission failure', () => {
    const error = new ProjectRelationLookupError('company', {
      type: 'permission',
      status: 403,
      retryable: false,
      message: 'Forbidden',
    });
    expect(getProjectSaveErrorMessage(error)).toBe(
      "You don't have permission to use the selected company. Your changes are still here."
    );
  });
});
