import { describe, expect, it } from 'vitest';
import { buildResetConfirmationPath, getLegacyResetHashPath } from '../resetLink';

const RESET_PATH = '/auth/confirm-password-reset/';

describe('password reset links', () => {
  it('encodes decoded opaque tokens as one canonical path segment', () => {
    expect(buildResetConfirmationPath('token/with?query#hash')).toBe(
      `${RESET_PATH}token%2Fwith%3Fquery%23hash`
    );
  });

  it.each([
    ['token%2Fwith', 'token%2Fwith'],
    ['token%3Fwith', 'token%3Fwith'],
    ['token%23with', 'token%23with'],
    ['header.payload.signature', 'header.payload.signature'],
  ])('decodes and re-encodes one legacy hash token: %s', (encodedToken, canonicalToken) => {
    expect(getLegacyResetHashPath(`#/auth/confirm-password-reset/${encodedToken}`)).toBe(
      `${RESET_PATH}${canonicalToken}`
    );
  });

  it('accepts query and hash characters in a legacy fragment token', () => {
    expect(getLegacyResetHashPath('#/auth/confirm-password-reset/token?query#hash')).toBe(
      `${RESET_PATH}token%3Fquery%23hash`
    );
  });

  it('rejects real extra path segments before decoding', () => {
    expect(getLegacyResetHashPath('#/auth/confirm-password-reset/token/extra')).toBeNull();
  });

  it('rejects empty tokens', () => {
    expect(buildResetConfirmationPath('')).toBeNull();
    expect(getLegacyResetHashPath('#/auth/confirm-password-reset/')).toBeNull();
  });
});
