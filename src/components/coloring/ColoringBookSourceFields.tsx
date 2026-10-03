import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

export function ColoringBookSourceFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
}: ColoringBookFieldSectionProps) {
  return (
    <Section label="Source URL">
      <Label htmlFor="coloring-source-url" className="sr-only">
        Source URL
      </Label>
      <Input
        id="coloring-source-url"
        type="url"
        value={values.sourceUrl ?? ''}
        onChange={event => setField('sourceUrl', event.target.value)}
        placeholder="https://example.com/book"
        disabled={isSubmitting}
        aria-invalid={fieldErrors.sourceUrl ? 'true' : 'false'}
        aria-describedby={fieldErrors.sourceUrl ? getColoringBookErrorId('sourceUrl') : undefined}
      />
      <FieldError field="sourceUrl" fieldErrors={fieldErrors} />
    </Section>
  );
}
