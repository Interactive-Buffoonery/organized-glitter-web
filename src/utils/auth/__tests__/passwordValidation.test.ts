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

  it('rejects passwords without an uppercase letter', () => {
    expect(validatePasswordStrength('lowercase123')).toContain(
      'Password must contain at least one uppercase letter'
    );
  });

  it('rejects passwords without a lowercase letter', () => {
    expect(validatePasswordStrength('UPPERCASE123')).toContain(
      'Password must contain at least one lowercase letter'
    );
  });

  it('rejects passwords without a number', () => {
    expect(validatePasswordStrength('NoNumbersHere')).toContain(
      'Password must contain at least one number'
    );
  });
});
