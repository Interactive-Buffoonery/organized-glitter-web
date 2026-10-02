import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

export function ColoringBookIdentityFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
}: ColoringBookFieldSectionProps) {
  return (
    <Section label="Book" flush="always">
      <div className="space-y-2">
        <Label htmlFor="coloring-title">Title *</Label>
        <Input
          id="coloring-title"
          value={values.title}
          onChange={event => setField('title', event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.title ? 'true' : 'false'}
          aria-describedby={fieldErrors.title ? getColoringBookErrorId('title') : undefined}
        />
        <FieldError field="title" fieldErrors={fieldErrors} />
      </div>
    </Section>
  );
}
