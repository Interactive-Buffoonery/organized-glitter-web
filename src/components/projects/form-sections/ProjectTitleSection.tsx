import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues } from '@/types/project';
import { FieldError, type ProjectFormFieldChange } from './ProjectFormSectionPrimitives';
import { getErrorId } from './projectFormSectionUtils';

interface ProjectTitleSectionProps {
  formData: ProjectFormValues;
  isSubmitting: boolean;
  fieldErrors: ProjectFormFieldErrors;
  onFieldChange: ProjectFormFieldChange;
}

export const ProjectTitleSection = ({
  formData,
  isSubmitting,
  fieldErrors,
  onFieldChange,
}: ProjectTitleSectionProps) => (
  <div className="space-y-2">
    <Label htmlFor="title" className="text-foreground text-sm font-medium">
      Title *
    </Label>
    <Input
      className="min-h-11"
      id="title"
      value={formData.title || ''}
      onChange={event => onFieldChange('title', event.target.value)}
      placeholder="Project title"
      disabled={isSubmitting}
      style={{ fontSize: '16px' }}
      required
      aria-invalid={fieldErrors.title ? 'true' : 'false'}
      aria-describedby={fieldErrors.title ? getErrorId('title') : undefined}
    />
    <FieldError field="title" message={fieldErrors.title} />
  </div>
);
