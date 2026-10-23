import { describe, expect, it } from 'vitest';
import { buildResetConfirmationPath, getLegacyResetHashPath } from '../resetLink';

const RESET_PATH = '/auth/confirm-password-reset/';

describe('password reset links', () => {
  it('encodes decoded opaque tokens as one canonical path segment', () => {
    expect(buildResetConfirmationPath('token/with?query#hash')).toBe(
      `${RESET_PATH}token%2Fwith%3Fquery%23hash`
    );
  });

  it('accepts query and hash characters in a legacy fragment token', () => {
    expect(getLegacyResetHashPath('#/auth/confirm-password-reset/token?query#hash')).toBe(
      `${RESET_PATH}token%3Fquery%23hash`
    );
  });
});
