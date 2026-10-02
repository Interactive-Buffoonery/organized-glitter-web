import { z } from 'zod';
import {
  ColoringBooksBookFormatOptions,
  ColoringBooksLanguageOptions,
  ColoringBooksStatusOptions,
} from '@/types/pocketbase.types';
import type { Tag } from '@/types/tag';
import { COLORING_BOOK_MAX_PAGES } from '@/constants/coloringBookMetadata';

const optionalYearField = z.union([
  z.coerce
    .number()
    .int()
    .min(1000, 'Publication year must be four digits')
    .max(9999, 'Publication year must be four digits'),
  z.literal('').transform(() => undefined),
]);

const optionalEnumField = <T extends Record<string, string>>(options: T) =>
  z.union([z.nativeEnum(options), z.literal('').transform(() => undefined)]).optional();

const ColoringBookFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    totalPages: z.coerce.number().int().min(1, 'Total pages must be at least 1'),
    status: z.nativeEnum(ColoringBooksStatusOptions),
    series: z.string().trim().optional(),
    theme: z.string().trim().optional(),
    isbn: z.string().trim().optional(),
    sourceUrl: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    edition: z.string().trim().optional(),
    datePurchased: z.string().optional(),
    dateReceived: z.string().optional(),
    dateStarted: z.string().optional(),
    dateCompleted: z.string().optional(),
    publicationYear: optionalYearField.optional(),
    bookFormat: optionalEnumField(ColoringBooksBookFormatOptions),
    language: optionalEnumField(ColoringBooksLanguageOptions),
    isMystery: z.boolean(),
    publisher: z.string().optional(),
    illustrator: z.string().optional(),
    tags: z.array(z.custom<Tag>()).optional(),
    coverImage: z.instanceof(File).nullable().optional(),
    coverImageRemoved: z.boolean().optional(),
  })
  .superRefine((values, context) => {
    if (values.sourceUrl) {
      const urlResult = z.string().url().safeParse(values.sourceUrl);
      if (!urlResult.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceUrl'],
          message: 'Link must be a valid URL',
        });
      }
    }

    if (values.notes && values.notes.length > 5000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Notes must be 5000 characters or less',
      });
    }

    if (values.datePurchased && values.dateReceived && values.dateReceived < values.datePurchased) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateReceived'],
        message: 'Received date cannot be before purchase date',
      });
    }

    if (values.datePurchased && values.dateStarted && values.dateStarted < values.datePurchased) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateStarted'],
        message: 'Start date cannot be before purchase date',
      });
    }

    if (values.dateStarted && values.dateCompleted && values.dateCompleted < values.dateStarted) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateCompleted'],
        message: 'Completion date cannot be before start date',
      });
    }
  });

export type ColoringBookSubmitValues = z.output<typeof ColoringBookFormSchema>;
export type ColoringBookFormValues = Omit<z.input<typeof ColoringBookFormSchema>, 'totalPages'> & {
  totalPages: number | '';
};

export type ColoringBookFormFieldErrors = Partial<Record<keyof ColoringBookFormValues, string>>;

interface ColoringBookValidationContext {
  existingTotalPages?: number;
}

export function validateColoringBookForm(
  values: ColoringBookFormValues,
  context: ColoringBookValidationContext = {}
): {
  isValid: boolean;
  fieldErrors: ColoringBookFormFieldErrors;
  values?: ColoringBookSubmitValues;
} {
  const result = ColoringBookFormSchema.safeParse(values);
  const fieldErrors: ColoringBookFormFieldErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof ColoringBookFormValues | undefined;
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
  }

  const totalPages = result.success ? result.data.totalPages : Number(values.totalPages);
  if (
    Number.isInteger(totalPages) &&
    totalPages > COLORING_BOOK_MAX_PAGES &&
    (context.existingTotalPages === undefined || totalPages > context.existingTotalPages)
  ) {
    fieldErrors.totalPages =
      context.existingTotalPages === undefined
        ? `Total pages must be ${COLORING_BOOK_MAX_PAGES} or less`
        : `Total pages cannot be increased above ${COLORING_BOOK_MAX_PAGES}`;
  }

  if (!result.success || Object.keys(fieldErrors).length > 0) {
    return { isValid: false, fieldErrors };
  }

  return { isValid: true, fieldErrors, values: result.data };
}
