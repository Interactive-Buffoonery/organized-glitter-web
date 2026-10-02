import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

export function ColoringBookNotesFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
}: ColoringBookFieldSectionProps) {
  return (
    <Section label="Notes">
      <div className="space-y-2">
        <Label htmlFor="coloring-notes" className="sr-only">
          Notes
        </Label>
        <Textarea
          id="coloring-notes"
          value={values.notes ?? ''}
          onChange={event => setField('notes', event.target.value)}
          placeholder="Anything you want to remember about this book..."
          disabled={isSubmitting}
          className="min-h-40"
          aria-invalid={fieldErrors.notes ? 'true' : 'false'}
          aria-describedby={fieldErrors.notes ? getColoringBookErrorId('notes') : undefined}
        />
        <FieldError field="notes" fieldErrors={fieldErrors} />
      </div>
    </Section>
  );
}
