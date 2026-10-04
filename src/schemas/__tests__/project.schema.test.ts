import { describe, it, expect, vi } from 'vitest';
import {
  BaseProjectFormObjectSchema,
  ProjectFormSchema,
  mapProjectServerFieldErrors,
  validateProjectFormValues,
} from '../project.schema';

const validBase = {
  userId: 'abc123def456ghi',
  title: 'Test Project',
  status: 'wishlist' as const,
};

describe('BaseProjectFormObjectSchema', () => {
  describe('date field validation', () => {
    it('should accept valid YYYY-MM-DD date strings', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: '2025-01-15',
        dateStarted: '2025-02-01',
      });
      expect(result.success).toBe(true);
    });

    it('should accept Date objects', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: new Date('2025-01-15'),
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty strings as undefined', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.datePurchased).toBeUndefined();
      }
    });

    it('should accept null values', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: null,
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined values', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid date formats', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: '01/15/2025',
      });
      expect(result.success).toBe(false);
    });

    it('should reject partial date strings', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        dateStarted: '2025-01',
      });
      expect(result.success).toBe(false);
    });

    it('should validate all four date fields independently', () => {
      const allDates = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        datePurchased: '2025-01-01',
        dateReceived: '2025-01-10',
        dateStarted: '2025-02-01',
        dateCompleted: '2025-06-15',
      });
      expect(allDates.success).toBe(true);
    });
  });

  describe('required fields', () => {
    it('should require title', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('should require valid userId', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        userId: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should require valid status', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional numeric fields', () => {
    it('should accept valid dimensions', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        width: 30,
        height: 40,
      });
      expect(result.success).toBe(true);
    });

    it('should preprocess empty string dimensions to undefined', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        width: '',
        height: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative dimensions', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        width: -10,
      });
      expect(result.success).toBe(false);
    });

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

    it('should allow blank color counts', () => {
      const result = BaseProjectFormObjectSchema.safeParse({
        ...validBase,
        colorCount: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.colorCount).toBeUndefined();
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

  it('should accept valid chronological order', () => {
    const result = ProjectFormSchema.safeParse({
      ...validBase,
      datePurchased: '2025-01-01',
      dateStarted: '2025-02-01',
      dateCompleted: '2025-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('should accept same day for start and completion', () => {
    const result = ProjectFormSchema.safeParse({
      ...validBase,
      dateStarted: '2025-03-15',
      dateCompleted: '2025-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('should allow dates to be independent when others are missing', () => {
    const result = ProjectFormSchema.safeParse({
      ...validBase,
      dateCompleted: '2025-01-01',
    });
    expect(result.success).toBe(true);
  });
});

describe('validateProjectFormValues', () => {
  it('maps required title errors to the title field', () => {
    const result = validateProjectFormValues({ ...validBase, title: '' });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.title).toBe('Title is required');
  });

  it('maps source URL errors to the sourceUrl field', () => {
    const result = validateProjectFormValues({
      ...validBase,
      sourceUrl: 'not-a-url',
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.sourceUrl).toBe('Source URL must be a valid URL if provided');
  });

  it('maps numeric validation errors to their fields', () => {
    const result = validateProjectFormValues({
      ...validBase,
      width: '-10',
      height: '-20',
      totalDiamonds: '12.5',
      colorCount: '12.5',
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.width).toBe('Width must be a positive number');
    expect(result.fieldErrors.height).toBe('Height must be a positive number');
    expect(result.fieldErrors.totalDiamonds).toBe('Total diamonds must be an integer');
    expect(result.fieldErrors.colorCount).toBe('# of colors must be an integer');
  });

  it('maps non-number color count validation errors to the colorCount field', () => {
    const result = validateProjectFormValues({
      ...validBase,
      colorCount: 'many',
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.colorCount).toBe('# of colors must be a number');
  });

  it('maps non-positive color count validation errors to the colorCount field', () => {
    const result = validateProjectFormValues({
      ...validBase,
      colorCount: '0',
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.colorCount).toBe('# of colors must be positive');
  });

  it('maps cross-field date errors to the later date field', () => {
    const startedBeforePurchased = validateProjectFormValues({
      ...validBase,
      datePurchased: '2025-06-01',
      dateStarted: '2025-01-01',
    });
    const completedBeforeStarted = validateProjectFormValues({
      ...validBase,
      dateStarted: '2025-06-01',
      dateCompleted: '2025-01-01',
    });

    expect(startedBeforePurchased.fieldErrors.dateStarted).toBe(
      'Start date cannot be before purchase date'
    );
    expect(completedBeforeStarted.fieldErrors.dateCompleted).toBe(
      'Completion date cannot be before start date'
    );
  });
});

describe('mapProjectServerFieldErrors', () => {
  it('maps PocketBase snake_case fields to form fields', () => {
    expect(
      mapProjectServerFieldErrors({
        source_url: 'Invalid URL',
        total_diamonds: 'Must be a number',
        color_count: 'Must be positive',
        date_started: 'Must be after purchase date',
      })
    ).toEqual({
      sourceUrl: 'Invalid URL',
      totalDiamonds: 'Must be a number',
      colorCount: 'Must be positive',
      dateStarted: 'Must be after purchase date',
    });
  });
});

describe('ProjectFormSchema future date validation', () => {
  it.each([
    ['datePurchased', 'Purchase'],
    ['dateReceived', 'Received'],
    ['dateStarted', 'Start'],
    ['dateCompleted', 'Completion'],
  ])('allows today and rejects tomorrow for %s', (field, label) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 0, 5));
    try {
      for (const value of ['2026-10-04', new Date(2026, 9, 4, 23, 59)]) {
        expect(ProjectFormSchema.safeParse({ ...validBase, [field]: value }).success).toBe(true);
      }
      for (const value of ['2026-10-05', new Date(2026, 9, 5)]) {
        const result = ProjectFormSchema.safeParse({ ...validBase, [field]: value });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toContainEqual(
            expect.objectContaining({
              path: [field],
              message: `${label} date cannot be in the future`,
            })
          );
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
