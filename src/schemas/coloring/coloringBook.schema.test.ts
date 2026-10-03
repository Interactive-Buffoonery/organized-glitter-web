import { describe, expect, it } from 'vitest';

import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { validateColoringBookForm, type ColoringBookFormValues } from './coloringBook.schema';

const validValues = (overrides: Partial<ColoringBookFormValues> = {}): ColoringBookFormValues => ({
  title: 'Mythical Botanicals',
  totalPages: 50,
  status: ColoringBooksStatusOptions.purchased,
  series: '',
  theme: '',
  isbn: '',
  publicationYear: '',
  edition: '',
  language: 'english',
  sourceUrl: '',
  datePurchased: '',
  dateReceived: '',
  dateStarted: '',
  dateCompleted: '',
  bookFormat: 'paperback',
  notes: '',
  isMystery: false,
  publisher: '',
  illustrator: '',
  tags: [],
  coverImage: null,
  ...overrides,
});

describe('ColoringBookFormSchema', () => {
  it('accepts retained optional metadata options', () => {
    const result = validateColoringBookForm(
      validValues({
        sourceUrl: 'https://example.com/book',
        notes: 'Keep this one for gel pens.',
        datePurchased: '2026-01-01',
        dateReceived: '2026-01-03',
        dateStarted: '2026-01-10',
        dateCompleted: '2026-01-20',
        publicationYear: 2025,
        language: 'english',
        bookFormat: 'pdf',
      })
    );

    expect(result.isValid).toBe(true);
    expect(result.fieldErrors).toEqual({});
  });

  it('accepts paperback and hardcover book formats', () => {
    expect(validateColoringBookForm(validValues({ bookFormat: 'paperback' })).isValid).toBe(true);
    expect(validateColoringBookForm(validValues({ bookFormat: 'hardcover' })).isValid).toBe(true);
  });

  it('rejects invalid URLs and oversized notes', () => {
    const result = validateColoringBookForm(
      validValues({
        sourceUrl: 'not-a-url',
        notes: 'x'.repeat(5001),
      })
    );

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.sourceUrl).toBe('Link must be a valid URL');
    expect(result.fieldErrors.notes).toBe('Notes must be 5000 characters or less');
  });

  it('rejects out-of-order dates', () => {
    const result = validateColoringBookForm(
      validValues({
        datePurchased: '2026-02-01',
        dateReceived: '2026-01-31',
        dateStarted: '2026-01-30',
        dateCompleted: '2026-01-29',
      })
    );

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.dateReceived).toBe('Received date cannot be before purchase date');
    expect(result.fieldErrors.dateStarted).toBe('Start date cannot be before purchase date');
    expect(result.fieldErrors.dateCompleted).toBe('Completion date cannot be before start date');
  });

  it('accepts in progress as the active-progress status value', () => {
    const result = validateColoringBookForm(
      validValues({ status: ColoringBooksStatusOptions.in_progress })
    );

    expect(result.isValid).toBe(true);
  });

  it('rejects page counts above the supported 500-page limit', () => {
    const result = validateColoringBookForm(validValues({ totalPages: 501 }));

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.totalPages).toBe('Total pages must be 500 or less');
  });

  it('allows an existing oversized book to keep or reduce its page count', () => {
    expect(
      validateColoringBookForm(validValues({ totalPages: 600 }), { existingTotalPages: 600 })
        .isValid
    ).toBe(true);
    expect(
      validateColoringBookForm(validValues({ totalPages: 550 }), { existingTotalPages: 600 })
        .isValid
    ).toBe(true);

    const increase = validateColoringBookForm(validValues({ totalPages: 601 }), {
      existingTotalPages: 600,
    });
    expect(increase.isValid).toBe(false);
    expect(increase.fieldErrors.totalPages).toBe('Total pages cannot be increased above 500');
  });
});
