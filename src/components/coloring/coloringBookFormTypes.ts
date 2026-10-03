import type {
  ColoringBookFormFieldErrors,
  ColoringBookFormValues,
} from '@/schemas/coloring/coloringBook.schema';

type ColoringBookSetField = <K extends keyof ColoringBookFormValues>(
  field: K,
  value: ColoringBookFormValues[K]
) => void;

export interface ColoringBookFieldSectionProps {
  values: ColoringBookFormValues;
  fieldErrors: ColoringBookFormFieldErrors;
  isSubmitting: boolean;
  setField: ColoringBookSetField;
}

export const getColoringBookErrorId = (field: keyof ColoringBookFormValues) =>
  `coloring-${String(field)}-error`;
