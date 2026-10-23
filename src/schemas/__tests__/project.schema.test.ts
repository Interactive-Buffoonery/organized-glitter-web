import { describe, it, expect } from 'vitest';
import {
  BaseProjectFormObjectSchema,
  ProjectFormSchema,
  validateProjectFormValues,
} from '../project.schema';

const validBase = {
  userId: 'abc123def456ghi',
  title: 'Test Project',
  status: 'wishlist' as const,
};

describe('BaseProjectFormObjectSchema', () => {
  describe('optional numeric fields', () => {
    it('should accept valid color counts', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        colorCount: '48',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.colorCount).toBe(48);
      }
    });
  });
});

describe('ProjectFormSchema cross-field validation', () => {
  it('should reject when purchase date is after start date', () => {
    const result = ProjectFormSchema.safeParse({
      ...validBase,
      datePurchased: '2025-06-01',
      dateStarted: '2025-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('dateStarted');
    }
  });

  it('should reject when start date is after completion date', () => {
    const result = ProjectFormSchema.safeParse({
      ...validBase,
      dateStarted: '2025-06-01',
      dateCompleted: '2025-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('dateCompleted');
    }
  });

  it('should accept same day for start and completion', () => {
    const result = ProjectFormSchema.safeParse({
      ...validBase,
      dateStarted: '2025-03-15',
      dateCompleted: '2025-03-15',
    });
    expect(result.success).toBe(true);
  });
});

describe('validateProjectFormValues', () => {
  it('maps non-number color count validation errors to the colorCount field', () => {
    const result = validateProjectFormValues(
      {
        ...validBase,
        colorCount: 'many',
      },
      '2026-10-04'
    );

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.colorCount).toBe('# of colors must be a number');
  });
});
