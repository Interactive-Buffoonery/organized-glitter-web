import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

export function ColoringBookAcquisitionFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
}: ColoringBookFieldSectionProps) {
  return (
    <Section label="Dates">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="coloring-date-purchased">Purchased</Label>
          <DateField
            id="coloring-date-purchased"
            value={values.datePurchased ?? ''}
            onChange={value => setField('datePurchased', value)}
            calendarLabel="coloring book purchase date"
            clearable
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-date-received">Received</Label>
          <DateField
            id="coloring-date-received"
            value={values.dateReceived ?? ''}
            onChange={value => setField('dateReceived', value)}
            calendarLabel="coloring book received date"
            clearable
            disabled={isSubmitting}
            aria-invalid={fieldErrors.dateReceived ? 'true' : 'false'}
            aria-describedby={
              fieldErrors.dateReceived ? getColoringBookErrorId('dateReceived') : undefined
            }
          />
          <FieldError field="dateReceived" fieldErrors={fieldErrors} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-date-started">Started</Label>
          <DateField
            id="coloring-date-started"
            value={values.dateStarted ?? ''}
            onChange={value => setField('dateStarted', value)}
            calendarLabel="coloring book start date"
            clearable
            disabled={isSubmitting}
            aria-invalid={fieldErrors.dateStarted ? 'true' : 'false'}
            aria-describedby={
              fieldErrors.dateStarted ? getColoringBookErrorId('dateStarted') : undefined
            }
          />
          <FieldError field="dateStarted" fieldErrors={fieldErrors} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-date-completed">Completed</Label>
          <DateField
            id="coloring-date-completed"
            value={values.dateCompleted ?? ''}
            onChange={value => setField('dateCompleted', value)}
            calendarLabel="coloring book completion date"
            clearable
            disabled={isSubmitting}
            aria-invalid={fieldErrors.dateCompleted ? 'true' : 'false'}
            aria-describedby={
              fieldErrors.dateCompleted ? getColoringBookErrorId('dateCompleted') : undefined
            }
          />
          {(values.status === 'archived' || values.status === 'destashed') && (
            <p className="text-muted-foreground text-xs">
              Adding a completion date keeps this book {values.status}.
            </p>
          )}
          <FieldError field="dateCompleted" fieldErrors={fieldErrors} />
        </div>
      </div>
    </Section>
  );
}
