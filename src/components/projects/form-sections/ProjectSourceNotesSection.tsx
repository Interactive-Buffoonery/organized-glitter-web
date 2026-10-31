import RichTextEditor from '@/components/notes/RichTextEditor.lazy';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues } from '@/types/project';
import { FieldError, Section, type ProjectFormFieldChange } from './ProjectFormSectionPrimitives';
import { getErrorId } from './projectFormSectionUtils';

interface ProjectSourceNotesSectionProps {
  formData: ProjectFormValues;
  isSubmitting: boolean;
  fieldErrors: ProjectFormFieldErrors;
  onFieldChange: ProjectFormFieldChange;
}

export const ProjectSourceNotesSection = ({
  formData,
  isSubmitting,
  fieldErrors,
  onFieldChange,
}: ProjectSourceNotesSectionProps) => (
  <Section label="Source and notes">
    <div className="space-y-2">
      <Label htmlFor="sourceUrl" className="text-sm font-medium">
        Source URL
      </Label>
      <Input
        className="min-h-11"
        id="sourceUrl"
        type="url"
        value={formData.sourceUrl || ''}
        onChange={event => onFieldChange('sourceUrl', event.target.value)}
        placeholder="https://example.com/pattern"
        disabled={isSubmitting}
        aria-invalid={fieldErrors.sourceUrl ? 'true' : 'false'}
        aria-describedby={fieldErrors.sourceUrl ? getErrorId('sourceUrl') : undefined}
      />
      <FieldError field="sourceUrl" message={fieldErrors.sourceUrl} />
    </div>

    <div className="space-y-2">
      <Label className="text-sm font-medium">Notes</Label>
      <RichTextEditor
        value={formData.generalNotes || ''}
        onChange={value => onFieldChange('generalNotes', value)}
        placeholder="Add any notes about this project..."
        disabled={isSubmitting}
        ariaLabel="Project notes"
        ariaInvalid={!!fieldErrors.generalNotes}
        ariaDescribedBy={fieldErrors.generalNotes ? getErrorId('generalNotes') : undefined}
      />
      <FieldError field="generalNotes" message={fieldErrors.generalNotes} />
    </div>
  </Section>
);
