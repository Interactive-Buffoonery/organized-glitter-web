import { describe, expect, it } from 'vitest';
import { validatePasswordStrength } from '../passwordValidation';

describe('validatePasswordStrength', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordStrength('ValidPass123')).toEqual([]);
  });

  it('rejects passwords that are too short', () => {
    expect(validatePasswordStrength('Aa1shrt')).toContain(
      'Password must be at least 8 characters long'
    );
  });
});
