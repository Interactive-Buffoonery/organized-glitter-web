import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues } from '@/types/project';
import { FieldError, Section } from './ProjectFormSectionPrimitives';
import { getErrorId } from './projectFormSectionUtils';

interface ProjectDatesSectionProps {
  formData: ProjectFormValues;
  isSubmitting: boolean;
  fieldErrors: ProjectFormFieldErrors;
  onDateChange: (field: keyof ProjectFormValues, value: string) => void;
}

export const ProjectDatesSection = ({
  formData,
  isSubmitting,
  fieldErrors,
  onDateChange,
}: ProjectDatesSectionProps) => (
  <Section label="Dates">
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="datePurchased" className="text-foreground text-sm font-medium">
          Date purchased
        </Label>
        <DateField
          id="datePurchased"
          value={formData.datePurchased || ''}
          onChange={value => onDateChange('datePurchased', value)}
          calendarLabel="date purchased"
          clearable
          disabled={isSubmitting}
          aria-invalid={fieldErrors.datePurchased ? 'true' : 'false'}
          aria-describedby={fieldErrors.datePurchased ? getErrorId('datePurchased') : undefined}
        />
        <FieldError field="datePurchased" message={fieldErrors.datePurchased} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dateReceived" className="text-foreground text-sm font-medium">
          Date received
        </Label>
        <DateField
          id="dateReceived"
          value={formData.dateReceived || ''}
          onChange={value => onDateChange('dateReceived', value)}
          calendarLabel="date received"
          clearable
          disabled={isSubmitting}
          aria-invalid={fieldErrors.dateReceived ? 'true' : 'false'}
          aria-describedby={fieldErrors.dateReceived ? getErrorId('dateReceived') : undefined}
        />
        <FieldError field="dateReceived" message={fieldErrors.dateReceived} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dateStarted" className="text-foreground text-sm font-medium">
          Date started
        </Label>
        <DateField
          id="dateStarted"
          value={formData.dateStarted || ''}
          onChange={value => onDateChange('dateStarted', value)}
          calendarLabel="date started"
          clearable
          disabled={isSubmitting}
          aria-invalid={fieldErrors.dateStarted ? 'true' : 'false'}
          aria-describedby={fieldErrors.dateStarted ? getErrorId('dateStarted') : undefined}
        />
        <FieldError field="dateStarted" message={fieldErrors.dateStarted} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dateCompleted" className="text-foreground text-sm font-medium">
          Date completed
        </Label>
        <DateField
          id="dateCompleted"
          value={formData.dateCompleted || ''}
          onChange={value => onDateChange('dateCompleted', value)}
          calendarLabel="date completed"
          clearable
          disabled={isSubmitting}
          aria-invalid={fieldErrors.dateCompleted ? 'true' : 'false'}
          aria-describedby={fieldErrors.dateCompleted ? getErrorId('dateCompleted') : undefined}
        />
        {(formData.status === 'archived' || formData.status === 'destashed') && (
          <p className="text-muted-foreground text-xs">
            Adding a completion date keeps this project {formData.status}.
          </p>
        )}
        <FieldError field="dateCompleted" message={fieldErrors.dateCompleted} />
      </div>
    </div>
  </Section>
);
