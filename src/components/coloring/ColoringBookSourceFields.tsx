import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from './ColoringBookFormPrimitives';
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
    <div className="space-y-2">
      <Label htmlFor="coloring-source-url" className="text-sm font-medium">
        Source URL
      </Label>
      <Input
        className="min-h-11"
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
    </div>
  );
}
