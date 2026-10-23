import { describe, expect, it } from 'vitest';
import { isUncertainProjectSaveError } from '../projectSaveError';

describe('project save outcome classification', () => {
  it.each([
    ['authentication', 'auth', undefined],
    ['expired session', 'server', 401],
    ['rate limit', 'server', 429],
  ] as const)('treats a retryable %s response as a definite failure', (_, type, status) => {
    expect(
      isUncertainProjectSaveError({ type, status, retryable: true, message: 'Save rejected' })
    ).toBe(false);
  });
});
